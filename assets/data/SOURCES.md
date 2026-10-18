# 地理资源来源与许可

准备日期：2026-10-18（Asia/Shanghai）。本项目运行时使用本地文件，无需 CDN 或地理接口。

## 城市目录

- 来源：[GeoNames cities15000.zip](https://download.geonames.org/export/dump/cities15000.zip)、[admin1CodesASCII.txt](https://download.geonames.org/export/dump/admin1CodesASCII.txt)。
- 格式和覆盖说明：[GeoNames 官方 Readme](https://download.geonames.org/export/dump/readme.txt)。
- 许可：[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)。城市数据由 GeoNames 提供；保留本来源说明以满足署名要求。
- `cities.json` 包含 34,167 个城市/聚落记录（244 个国家或地区代码）。源目录覆盖人口超过 15,000 的城市以及部分首府，并非完整的全球行政区划或所有小城镇。
- 转换：保留 GeoNames ID、WGS84 中心经纬度、国家/地区、一级行政区及来源人口估计（仅用于搜索排序，非实时人口统计）；经纬度保留 5 位小数。字段为 `id,name,countryCode,country,region,lat,lng,population,aliases`。
- 国家/地区名称通过 Node.js 的 `Intl.DisplayNames('zh')` 本地化。中国省级名称采用随脚本的 GeoNames FIPS 代码映射，中国主要城市采用按省份限定的中文名表；其余城市保留源名称。每条最多保留 12 个别名，优先原名、ASCII 名和中文别名。
- 中文覆盖并不完整；未标注语言的别名仅用于搜索，不据此冒认为标准简体名称。行政区与人口数据可能变化，坐标是城市/聚落参考点，不是边界，附近城市推荐不能保证实际行政归属。
- 本数据不包含访客位置；设备精确位置无需加入这些资源。

## 陆地轮廓

- 来源：[Natural Earth 作者维护的 ne_110m_land.geojson](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson)。
- Made with Natural Earth：[Natural Earth 官网](https://www.naturalearthdata.com/)；[公开领域使用条款](https://www.naturalearthdata.com/about/terms-of-use/)。
- `land.geojson` 保留 127 个陆地几何要素，删除未使用的元数据并紧凑编码。比例尺 1:110m，用于地球远景轮廓，不适合街道或精细行政边界定位；本文件不呈现国界。

## 重新准备

在项目目录运行 `python scripts/prepare-geodata.py`。需要 Python 3、可在 PATH 中调用的 Node.js 和联网权限，脚本仅使用标准库，无新增依赖。准备过程下载最新上游快照，因此不同日期生成的数据条数可能不同；运行网站不需要 Python 或联网。

本次原始下载的 SHA-256：

| 来源 | SHA-256 |
| --- | --- |
| cities | `7d1c80d5be04850227384c1f6f9163b56401dc46270be1012e1a2de0a5bf4a70` |
| regions | `1da92a6323a5fec3176f3f743bf4cf4040fd56a876da55e46fbca23c863aa60a` |
| land | `9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9` |
