"""Build offline Starry Wall geography assets with Python's standard library.

Usage: python scripts/prepare-geodata.py
Downloads use the public source URLs below. Nothing runs at application startup.
"""

import argparse
import datetime
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request
import zipfile


SOURCES = {
    "cities": "https://download.geonames.org/export/dump/cities15000.zip",
    "regions": "https://download.geonames.org/export/dump/admin1CodesASCII.txt",
    "land": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson",
}

# GeoNames CN admin1 fields are FIPS codes, not ISO province numbers.
CHINA_REGIONS = {
    "01": "安徽", "02": "浙江", "03": "江西", "04": "江苏", "05": "吉林",
    "06": "青海", "07": "福建", "08": "黑龙江", "09": "河南", "10": "河北",
    "11": "湖南", "12": "湖北", "13": "新疆", "14": "西藏", "15": "甘肃",
    "16": "广西", "18": "贵州", "19": "辽宁", "20": "内蒙古", "21": "宁夏",
    "22": "北京", "23": "上海", "24": "山西", "25": "山东", "26": "陕西",
    "28": "天津", "29": "云南", "30": "广东", "31": "海南", "32": "四川",
    "33": "重庆",
}

# Curated names are tied to administrative region to avoid homonym collisions.
# Uncurated rows retain the GeoNames source name; untagged alternate names are
# searchable but never silently assumed to be the preferred simplified name.
CHINA_CITIES = {
    "01": {"Hefei": "合肥", "Wuhu": "芜湖", "Anqing": "安庆", "Bengbu": "蚌埠", "Huangshan": "黄山", "Fuyang": "阜阳"},
    "02": {"Hangzhou": "杭州", "Ningbo": "宁波", "Wenzhou": "温州", "Jiaxing": "嘉兴", "Shaoxing": "绍兴", "Jinhua": "金华", "Huzhou": "湖州", "Quzhou": "衢州", "Lishui": "丽水", "Zhoushan": "舟山", "Taizhou": "台州"},
    "03": {"Nanchang": "南昌", "Jiujiang": "九江", "Ganzhou": "赣州", "Jingdezhen": "景德镇", "Shangrao": "上饶"},
    "04": {"Nanjing": "南京", "Suzhou": "苏州", "Wuxi": "无锡", "Changzhou": "常州", "Nantong": "南通", "Yangzhou": "扬州", "Zhenjiang": "镇江", "Xuzhou": "徐州", "Huai'an": "淮安", "Huai’an": "淮安", "Huaian": "淮安", "Huaiyin": "淮安", "Suqian": "宿迁", "Lianyungang": "连云港", "Taizhou": "泰州", "Yancheng": "盐城", "Jiangyin": "江阴", "Kunshan": "昆山", "Changshu": "常熟", "Yixing": "宜兴", "Taicang": "太仓"},
    "05": {"Changchun": "长春", "Jilin": "吉林", "Yanji": "延吉"},
    "06": {"Xining": "西宁", "Golmud": "格尔木"},
    "07": {"Fuzhou": "福州", "Xiamen": "厦门", "Quanzhou": "泉州", "Zhangzhou": "漳州", "Putian": "莆田"},
    "08": {"Harbin": "哈尔滨", "Qiqihar": "齐齐哈尔", "Daqing": "大庆", "Mudanjiang": "牡丹江"},
    "09": {"Zhengzhou": "郑州", "Luoyang": "洛阳", "Kaifeng": "开封", "Nanyang": "南阳", "Xinxiang": "新乡"},
    "10": {"Shijiazhuang": "石家庄", "Tangshan": "唐山", "Baoding": "保定", "Qinhuangdao": "秦皇岛", "Handan": "邯郸", "Langfang": "廊坊", "Zhangjiakou": "张家口"},
    "11": {"Changsha": "长沙", "Zhuzhou": "株洲", "Xiangtan": "湘潭", "Yueyang": "岳阳", "Hengyang": "衡阳", "Zhangjiajie": "张家界"},
    "12": {"Wuhan": "武汉", "Yichang": "宜昌", "Xiangyang": "襄阳", "Jingzhou": "荆州", "Huangshi": "黄石"},
    "13": {"Urumqi": "乌鲁木齐", "Kashgar": "喀什", "Turpan": "吐鲁番"},
    "14": {"Lhasa": "拉萨", "Xigaze": "日喀则"},
    "15": {"Lanzhou": "兰州", "Tianshui": "天水", "Dunhuang": "敦煌", "Jiayuguan": "嘉峪关"},
    "16": {"Nanning": "南宁", "Guilin": "桂林", "Liuzhou": "柳州", "Beihai": "北海"},
    "18": {"Guiyang": "贵阳", "Zunyi": "遵义", "Anshun": "安顺"},
    "19": {"Shenyang": "沈阳", "Dalian": "大连", "Anshan": "鞍山", "Dandong": "丹东", "Jinzhou": "锦州"},
    "20": {"Hohhot": "呼和浩特", "Baotou": "包头", "Ordos": "鄂尔多斯", "Chifeng": "赤峰"},
    "21": {"Yinchuan": "银川", "Shizuishan": "石嘴山"},
    "22": {"Beijing": "北京"},
    "23": {"Shanghai": "上海"},
    "24": {"Taiyuan": "太原", "Datong": "大同", "Changzhi": "长治", "Linfen": "临汾"},
    "25": {"Jinan": "济南", "Qingdao": "青岛", "Yantai": "烟台", "Weifang": "潍坊", "Weihai": "威海", "Jining": "济宁", "Linyi": "临沂", "Taian": "泰安", "Zibo": "淄博", "Dongying": "东营"},
    "26": {"Xi'an": "西安", "Xi’an": "西安", "Xian": "西安", "Xianyang": "咸阳", "Baoji": "宝鸡", "Yan'an": "延安", "Yan’an": "延安", "Hanzhong": "汉中"},
    "28": {"Tianjin": "天津"},
    "29": {"Kunming": "昆明", "Dali": "大理", "Lijiang": "丽江", "Qujing": "曲靖", "Yuxi": "玉溪"},
    "30": {"Guangzhou": "广州", "Shenzhen": "深圳", "Zhuhai": "珠海", "Foshan": "佛山", "Dongguan": "东莞", "Zhongshan": "中山", "Huizhou": "惠州", "Shantou": "汕头", "Jiangmen": "江门", "Zhanjiang": "湛江", "Chaozhou": "潮州", "Zhaoqing": "肇庆"},
    "31": {"Haikou": "海口", "Sanya": "三亚"},
    "32": {"Chengdu": "成都", "Mianyang": "绵阳", "Deyang": "德阳", "Leshan": "乐山", "Nanchong": "南充", "Yibin": "宜宾", "Luzhou": "泸州", "Zigong": "自贡"},
    "33": {"Chongqing": "重庆"},
}


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "StarryWall-GeodataPreparation/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "assets" / "data")
    args = parser.parse_args()
    raw = {key: download(url) for key, url in SOURCES.items()}
    regions = {}
    for line in raw["regions"].decode("utf-8").splitlines():
        values = line.split("\t")
        if len(values) >= 3:
            regions[values[0]] = values[1]
    with zipfile.ZipFile(io.BytesIO(raw["cities"])) as archive:
        rows = [line.split("\t") for line in archive.read("cities15000.txt").decode("utf-8").splitlines()]
    codes = sorted({row[8] for row in rows if len(row) >= 19 and row[8]})
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required for Intl.DisplayNames country localization")
    result = subprocess.run([node, "--input-type=module", "-e", "let input=''; for await (const chunk of process.stdin) input += chunk; const names = new Intl.DisplayNames(['zh'], {type:'region'}); console.log(JSON.stringify(Object.fromEntries(JSON.parse(input).map(code => [code,names.of(code)]))))"], input=json.dumps(codes), text=True, encoding="utf-8", capture_output=True, check=True)
    countries = json.loads(result.stdout)
    cities = []
    for row in rows:
        if len(row) < 19:
            continue
        identifier, original, ascii_name, alternate, latitude, longitude = row[:6]
        country_code, admin_code = row[8], row[10]
        alternatives = alternate.split(",") if alternate else []
        chinese = CHINA_CITIES.get(admin_code, {}) if country_code == "CN" else {}
        # A mapped alternate is accepted only when region also matches.
        name = next((chinese[variant] for variant in [original, ascii_name, *alternatives] if variant in chinese), original)
        region = CHINA_REGIONS.get(admin_code, regions.get(f"{country_code}.{admin_code}", "")) if country_code == "CN" else regions.get(f"{country_code}.{admin_code}", "")
        priority = [original, ascii_name]
        # Retain Chinese aliases first to make local-language search useful.
        priority += [alias for alias in alternatives if any("\u4e00" <= c <= "\u9fff" for c in alias)]
        priority += [alias for alias in alternatives if alias.isascii()]
        priority += alternatives
        aliases = []
        seen = {name.casefold()}
        for alias in priority:
            alias = alias.strip()
            if not alias or len(alias) > 64 or alias.casefold() in seen:
                continue
            seen.add(alias.casefold())
            aliases.append(alias)
            if len(aliases) == 12:
                break
        city = {"id": identifier, "name": name, "countryCode": country_code, "country": countries.get(country_code, country_code), "region": region, "lat": round(float(latitude), 5), "lng": round(float(longitude), 5), "population": int(row[14] or 0), "aliases": aliases}
        cities.append(city)
    cities.sort(key=lambda city: int(city["id"]))
    nanjing = next((city for city in cities if city["id"] == "1799962"), None)
    if not nanjing or nanjing["name"] != "南京" or nanjing["region"] != "江苏":
        raise ValueError(f"Unexpected Nanjing record: {nanjing}")
    land = json.loads(raw["land"])
    if land.get("type") != "FeatureCollection" or not land.get("features"):
        raise ValueError("Natural Earth source is not a nonempty GeoJSON FeatureCollection")
    # Drop metadata not used by the globe; preserve all source geometry.
    land = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": feature["geometry"]} for feature in land["features"]]}
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "cities.json").write_text(json.dumps(cities, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (args.output / "land.geojson").write_text(json.dumps(land, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    day = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date().isoformat()
    hashes = "\n".join(f"| {key} | `{hashlib.sha256(value).hexdigest()}` |" for key, value in raw.items())
    text = f"""# 地理资源来源与许可

准备日期：{day}（Asia/Shanghai）。本项目运行时使用本地文件，无需 CDN 或地理接口。

## 城市目录

- 来源：[GeoNames cities15000.zip]({SOURCES['cities']})、[admin1CodesASCII.txt]({SOURCES['regions']})。
- 格式和覆盖说明：[GeoNames 官方 Readme](https://download.geonames.org/export/dump/readme.txt)。
- 许可：[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)。城市数据由 GeoNames 提供；保留本来源说明以满足署名要求。
- `cities.json` 包含 {len(cities):,} 个城市/聚落记录（{len(codes)} 个国家或地区代码）。源目录覆盖人口超过 15,000 的城市以及部分首府，并非完整的全球行政区划或所有小城镇。
- 转换：保留 GeoNames ID、WGS84 中心经纬度、国家/地区、一级行政区及来源人口估计（仅用于搜索排序，非实时人口统计）；经纬度保留 5 位小数。字段为 `id,name,countryCode,country,region,lat,lng,population,aliases`。
- 国家/地区名称通过 Node.js 的 `Intl.DisplayNames('zh')` 本地化。中国省级名称采用随脚本的 GeoNames FIPS 代码映射，中国主要城市采用按省份限定的中文名表；其余城市保留源名称。每条最多保留 12 个别名，优先原名、ASCII 名和中文别名。
- 中文覆盖并不完整；未标注语言的别名仅用于搜索，不据此冒认为标准简体名称。行政区与人口数据可能变化，坐标是城市/聚落参考点，不是边界，附近城市推荐不能保证实际行政归属。
- 本数据不包含访客位置；设备精确位置无需加入这些资源。

## 陆地轮廓

- 来源：[Natural Earth 作者维护的 ne_110m_land.geojson]({SOURCES['land']})。
- Made with Natural Earth：[Natural Earth 官网](https://www.naturalearthdata.com/)；[公开领域使用条款](https://www.naturalearthdata.com/about/terms-of-use/)。
- `land.geojson` 保留 {len(land['features'])} 个陆地几何要素，删除未使用的元数据并紧凑编码。比例尺 1:110m，用于地球远景轮廓，不适合街道或精细行政边界定位；本文件不呈现国界。

## 重新准备

在项目目录运行 `python scripts/prepare-geodata.py`。需要 Python 3、可在 PATH 中调用的 Node.js 和联网权限，脚本仅使用标准库，无新增依赖。准备过程下载最新上游快照，因此不同日期生成的数据条数可能不同；运行网站不需要 Python 或联网。

本次原始下载的 SHA-256：

| 来源 | SHA-256 |
| --- | --- |
{hashes}
"""
    (args.output / "SOURCES.md").write_text(text, encoding="utf-8")
    print(json.dumps({"cities": len(cities), "countryCodes": len(codes), "landFeatures": len(land["features"]), "nanjing": nanjing, "files": {path.name: path.stat().st_size for path in args.output.iterdir() if path.is_file()}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
