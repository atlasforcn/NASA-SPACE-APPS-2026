# Mars data and sources

## Downloadable science layers

Layers includes four numerical grids and two historical station records downloaded on November 14, 2026. The site reads local static copies. No live requests to WMS or PDS are required.

| Layer | Product | Grid spacing and interpretation |
|---|---|---|
| Thermal | NASA MGS/TES thermal inertia, ASU TES_Thermal_Inertia_numeric | 8 pixels/degree (0.125°), J m⁻² K⁻¹ s⁻½. A TES surface property, distinct from current air temperature and higher-resolution THEMIS products. |
| Spectral | MGS/TES olivine abundance, Bandfield (2002), TES_Olivine_numeric | 4 pixels/degree (0.25°). Thermal infrared spectral unmixing estimates regional abundance. Individual rocks require local observations. |
| Geophysics | GMM-3 gravity anomaly, grav_ggmro_120_anom_100 | Native 16 pixels/degree, sampled at 2 pixels/degree (0.5°), in mGal. The spherical harmonic model through degree 100 resolves broader features than the display grid. |
| Chemistry | Odyssey GRS iron concentration, Boynton et al. (2007), GRS_Fe_conc_numeric | 0.2 pixels/degree (5°), wt % Fe. Local differences within Jezero or Gale fall below this resolution. |
| Atmosphere | Perseverance MEDA sol 1 derived pressure, PDS v2.0 | The mean of 2,330 valid samples on February 19, 2021 was 715.002 Pa. The rover had not moved from its landing coordinates, 18.4446°N, 77.4509°E (Bell et al., 2022). The samples cover part of the day. |
| Radiation | Curiosity RAD sol 1 RDR, PDS v1.0 | The arithmetic mean of 14 valid detector B samples was 8.925 µGy/h in silicon. This measures absorbed dose rate, distinct from dose equivalent or a time-weighted daily mean. The RDR coordinates were zero placeholders. The rover had not moved, so the map uses the Bradbury Landing coordinates (−4.5895°N, 137.4417°E) from [Vasavada et al. (2014)](https://doi.org/10.1002/2014JE004622). |

The grids come from [ASU JMARS WMS](https://ms-mars.mars.asu.edu/?SERVICE=WMS&REQUEST=GetCapabilities). See the [ASU global data catalog](https://mars.asu.edu/data/) and the original [NASA PDS Radio Science Digital Maps](https://pds-geosciences.wustl.edu/mro/mro-m-rss-5-sdp-v1/mrors_1xxx/data/rsdmap/).

`scripts/prepare-science.py` downloads VICAR grids, reads data type and byte order from their headers and shifts longitude columns from 0–360°E to −180–180°E in Mars coordinates. The Olympus Mons elevation maximum and 108 coarse reference cells from PDS MOLA16 were used to check JMARS:4 axis orientation and broad alignment. Display and cursor readings use the nearest cell. Missing and implausible values become NaN and are transparent in the PNG. No interpolation fills these gaps.

`data/science/manifest.json` records the request URLs, file sizes and SHA-256 hashes, VICAR headers, original citations and keywords, units, grid spacing, pixel center conventions, valid fractions and color scales. Each .bin contains little-endian float32 values. Each PNG applies fixed colors to the same grid. Colors saturate at the scale endpoints while readings retain the underlying values. The original station tables and PDS labels are in `data/science/raw/`. The RAD loader follows the 1-based label byte pointer to the 7-byte Total Dose B value and drops negative or nonfinite samples. Investigators should consult the mission documentation for additional quality flags.

Changing the visible layer changes the map display. Enabling geology or thermal inertia adjustments adds surface material to route costs. Station measurements appear at one location. Showing a station in another region keeps the current mission DEM.

## Source inventory

The app serves observations, maps and derived assets from `data/`. Gale high-resolution assets and the global MOLA numerical grid load on demand from the site.

| Feature or region | Source | Local data and use | Coverage |
|---|---|---|---|
| Global navigation and mission coordinates | [NASA PDS MOLA MEGDR](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) | `data/mola16.bin`, `data/mars-global-dem.jpg`. Elevations, global basemap and custom missions. | MGS laser altimetry on a 16 ppd global grid. Colors show derived relief. |
| Jezero | [USGS CTX DEM](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic), [CTX orthoimage](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif), [USGS geologic map](https://www.usgs.gov/maps/geologic-map-jezero-crater-and-nili-planum-region-mars) | `data/jezero-extended/dem.json`, optical.png and `data/geology.json`. | A 30 × 30 km DEM, native 20 m and sampled at 40 m. Full imagery extends beyond the DEM, native about 5 m and displayed at about 20 m/pixel. Geology covers the central region. |
| Gale | [USGS MSL Gale DEM](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m), [USGS Gale orthoimage](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm) | `data/gale/`, loaded on demand for local terrain and imagery. | Merged terrain and HiRISE imagery displayed more coarsely than the native pixels, with partial color coverage. |
| Valles Marineris | [USGS CTX DTM STAC](https://stac.astrogeology.usgs.gov/docs/tutorials/qgis_3d/) | `data/valles/`. Terrain and grayscale imagery across 20 × 20 km. | Single stereo DTM. Native spacing about 20 m, sampled at 40 m. About 94.2% valid. Gaps remain transparent. |
| Global science layers | [ASU JMARS numerical layers](https://ms-mars.mars.asu.edu/) | `data/science/*.bin`, PNGs and manifest.json. Thermal inertia, olivine abundance, gravity anomaly and iron content. | Multi-mission measurements and models for regional context. Each has its own resolution, coverage and citation. |
| Historical environment | [NASA PDS MEDA](https://pds-atmospheres.nmsu.edu/), [NASA PDS RAD](https://pds-ppi.igpp.ucla.edu/) | `data/science/manifest.json` and `data/science/raw/`. Perseverance pressure and Curiosity radiation on their respective sol 1. | Historical samples from one station and part of a day. |
| Three Forks sample depot | [NASA PDS Sample Depot](https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_sample_depot_three_forks/) | CSV/XML in `data/pds/` and `data/three-forks.geojson`. | Mission records for sample names, depot positions and times. |
| Place names and landings | [USGS/IAU Mars nomenclature GIS](https://planetarynames.wr.usgs.gov/GIS_Downloads), NASA and published studies | `data/mars-names.json` and `data/mission.json`. | Approved feature names and historical landing sites. Rover positions change after landing. |

Navigation uses valid local DEM samples first. Within 200 km of the local center, MOLA 16 ppd can fill gaps and extend coverage. A constant vertical offset aligns the grids at the local center. Orange dashes mark MOLA segments and the planner reports their length. Kilometer-scale MOLA supports coarse simulation. Wheel-scale roughness requires finer data. Beyond 200 km, create a regional MOLA mission to reduce errors from the local planar approximation.

The project derives slope, roughness, hillshade, skylines, color relief, sample GeoJSON and interface summaries from the listed sources. Rover positions, drift and route costs are simulated.

## Regional terrain and imagery

`scripts/prepare-jezero-extended.py` reads the official Jezero CTX DEM using HTTP range requests. The 751 × 751 sample grid is centered at 18.44°N, 77.42°E, with 40 m spacing and 100% valid cells. The output JSON records the URL, ETag, size, Mars projection, read window and sample-window hash. Hashes cover the downloaded windows. `scripts/prepare-jezero-extended-optical.py` downsamples the full CTX orthoimage by about four to about 20 m/pixel. Processing is documented in `data/jezero-extended/optical-source.json`. The orthoimage is for display. The earlier 9.7 × 7 km DEM crop was removed.

`scripts/prepare-valles.py` uses one controlled USGS STAC CTX stereo DTM and its matching orthoimage at −10.0°N, −69.3°E. The 501 × 501 grid has 40 m spacing. Elevations range from about −364 to 4,067 m and 94.2% of cells are valid. Both products use a common Mars frame. Grayscale imagery uses a 1st–99th percentile stretch. The items, URLs, native projection, windows and numeric hashes are recorded in the outputs. Gaps, noise and vertical errors affect slope estimates. Independent registration accuracy remains unmeasured.

In Explore, select Gale and load the region to fetch `data/gale/`. Its 10 × 10 km local equirectangular frame is centered at planetocentric −4.59°, 137.44° east with radius 3,396,190 m. The center is a simulated mission start.

- [USGS MSL Gale Merged DEM](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m). Calef/Parker v3 has native 1 m pixel spacing. Bilinear sampling and reprojection of the official 4 m external overview produces 501 × 501 cells at 20 m spacing. Source resolution varies across the mosaic. All cells are valid, with elevations of about −4,542 to −4,079 m.
- [USGS Gale orthoimage](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm). Native spacing is 25 cm. The site displays 1,500 × 1,500 pixels at about 6.67 m/pixel. HiRISE-LRGB color COGs from 78 quads cover about 51.5%. Grayscale imagery from the same collection completes the coverage. The color products were manually registered, blended and sharpened. Seams reflect imagery coverage.
- Elevation, slope, roughness and hillshade derive from the same DEM. Hillshade uses northwest lighting at 45° elevation. Neighborhood elevation variation provides a roughness index. Wheel-scale obstacles require finer observations.
- Gale has no integrated geologic polygon map. The Three Forks stations, landing marker and Jezero traverses apply only to Jezero.

`scripts/prepare-gale.py` rebuilds the crop using rasterio, numpy, Pillow and pyproj. HTTP range requests read TIFFs and overviews without downloading the entire 3.9 GB DEM or 24 GB grayscale image. The site runs without Python. JSON metadata records URLs, ETags, sizes, Mars WKT, native transforms, overviews, windows and SHA-256 hashes of sampled arrays. The asset inventory separately verifies the output files.

Terrain and imagery credit: NASA/JPL-Caltech, USGS, UArizona and the contributing teams. The color mosaic was produced by Timothy J. Parker and Fred J. Calef III. Both products use the same Mars frame. Independent control-point registration remains unmeasured. Distant peaks in a photograph can lie outside the 10 km crop.

| Jezero data | Product | Resolution and use |
|---|---|---|
| Terrain | [USGS Mars 2020 Science Investigation CTX DEM](https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic) | Native 20 m, sampled to 751 × 751 cells at 40 m over 30 × 30 km. All cells valid. |
| Optical | [USGS CTX orthoimage](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif) | Native about 5 m. Full 4,442 × 5,059 PNG at about 20 m/pixel. Display uses a 1st–99th percentile stretch. |
| Geology | [Sun & Stack 2020, USGS SIM 3464](https://www.usgs.gov/maps/geologic-map-jezero-crater-and-nili-planum-region-mars), [official GIS FeatureServer](https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Jezero_FeatureServiceFromPro/FeatureServer/8) | A 1:75,000 interpretive map. The site retains 27 polygons intersecting the demo area, their units, original descriptions and colors. |

MRO CTX provides the imagery and terrain. The DEM uses MGS/MOLA vertical control. Slope, roughness and skylines all derive from that DEM.

The local frame is centered at planetocentric 18.44°N, 77.42° east. East and north are in meters on a Mars sphere of radius 3,396,190 m. DEM and imagery are transformed from their native Mars coordinate systems. Geology is inverse-projected from Mars Transverse Mercator before conversion. Leaflet supplies an equirectangular display grid. Distances use local Mars meters.

`data/geology.json` preserves native WKT, query URL, original JSON SHA-256, fields and renderer. Intersecting features retain full polygon geometry. The display boundary defines the mission extent. Even–odd containment handles holes and multiple rings.

`data/jezero-extended/optical-source.json` documents the full image, CRS, display spacing and valid fraction. `data/jezero-extended/dem.json` documents terrain provenance and the sample-window hash.

Registration accuracy has not been checked with independent control points. Geologic units represent regional interpretations. Grid boundaries may truncate long sight lines, even when a ray extends beyond 1,200 m. Matching simulated observations to the same model can overstate performance on real photographs.

References: Calef et al. (2021), USGS Astrogeology. Sun, V.Z. and Stack, K.M. (2020), Geologic map of Jezero crater and the Nili Planum region, Mars, USGS Scientific Investigations Map 3464, https://doi.org/10.3133/sim3464. Optical imagery credit: NASA/JPL-Caltech/MSSS and USGS. Leaflet 1.9.4 uses the BSD-2-Clause license in `docs/Leaflet-LICENSE.txt`. Source agencies retain their licensing and citation conditions.

## Named features and global navigation

- The [official USGS/IAU GIS download](https://planetarynames.wr.usgs.gov/GIS_Downloads) supplies 2,055 adopted Martian feature names from MARS_nomenclature_center_pts.kmz. The catalog records feature centers, types, sizes, approval dates, name origins and individual source links. Official names retain their original spelling.
- Featured descriptions draw on [NASA Mars Facts](https://science.nasa.gov/mars/facts/). The global shaded relief is rendered from MOLA elevations described in `data/mola16.json`.
- NASA named [Octavia E. Butler Landing](https://science.nasa.gov/resource/welcome-to-octavia-e-butler-landing/). The historical landing coordinates, 18.4446°N, 77.4509°E, come from [Bell et al. (2022)](https://ntrs.nasa.gov/api/citations/20230016428/downloads/Bell%20et%20al%202022sciadv.pdf). This is a NASA mission name.

## Global elevation grid

The [NASA PDS MOLA MEGDR](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) [16 ppd product label](https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.lbl) specifies 5,760 × 2,880 big-endian int16 elevations in meters, using planetocentric latitude and positive-east longitude. Global elevations span −8,177 to 21,171 m. The source product interpolates empty cells in the median terrain grid.

`data/mola16.bin` is the little-endian numerical copy. Source and local hashes, pixel centers and the vertical datum are in `data/mola16.json`. The original label is in `data/mola16.lbl`. The regional sphere uses a radius of 3,396,190 m, slightly different from the label’s 3,396 km projection radius.

`data/mars-global-dem.jpg` renders a 5,760 × 2,880 global color relief, shifting 0–360° columns into −180–180° order. It replaces the earlier low-resolution WMTS basemap. Hillshade and polar row means are derived display treatments. The grid resolves broad terrain features.


### Global optical basemap (November 14, 2026)
- Product: [USGS Mars Viking Colorized Global Mosaic 232m](https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m).
- Download: https://astrogeology.usgs.gov/ckan/dataset/7131d503-cdc9-45a5-8f83-5126c0fd397e/resource/5ea881c6-01b3-41fa-a7af-42d2131b54f1/download/mars_viking_mdim21_clrmosaic_1km.jpg
- The 21,339 × 10,670 global 1 km JPEG is reduced to 2,048 × 1,024 in `data/mars-global-optical.jpg`. The equirectangular image spans −180° to 180° longitude and 90° to −90° latitude, about 10.4 km/pixel at the equator. Historical mosaic credit: NASA/JPL/USGS.
- The overview uses MOLA relief and colors from `mars-global-dem.jpg`. Cursor elevations come directly from `mola16.bin`, which loads on first entry to the overview.
