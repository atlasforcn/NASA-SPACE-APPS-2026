# Testing skyline matching with rover photographs

## Curiosity at Gale Crater

The public demo uses Curiosity’s left navigation camera panorama west of Dingo Gap, sols 538–539. We marked the visible skyline every 3°, retaining 210° of observations. The search ranked positions and headings in a 9.5 × 9.5 km area by comparing the observed skyline with terrain predictions. After ranking, we compared the top candidate with NASA’s record for Site 26, Drive 708. [NASA panorama](https://science.nasa.gov/resource/sol-0539-left-navigation-camera-cylindrical-projection/) · [PDS PLACES position records](https://planetarydata.jpl.nasa.gov/img/data/msl/msl_places/data_localizations/)

| Panorama | Top candidate error, 6 km terrain range (website) | Top candidate error, 90 km terrain range (offline) |
| --- | ---: | ---: |
| Sol 38, method development | 4,016 m | 1,449 m |
| Sol 535, blind test after fixing the method | 3,868 m | 5,699 m |
| Sols 538–539, additional case | 3,148 m | 815 m |

The 90 km run uses the same search area and ranking method, extending the regional terrain with a 200 m grid. The public page replays the result for sols 538–539. Its angular residual was 0.378°, above the 0.20° automatic correction threshold. The 815 m position error applies to this panorama. More independent stations are needed to establish typical accuracy. [USGS terrain used for distant horizons](https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m)

## Perseverance candidates at Jezero

1. Start with panorama #1 at Octavia E. Butler Landing, sols 3/11, in the [Mastcam-Z panorama collection](https://mastcamz.asu.edu/mastcam-zs-360-panorama-collection/). The source provides natural-color left and right images and projection information. Credit: NASA/JPL-Caltech/ASU/MSSS. For a multi-sol panorama, verify the position and attitude of each exposure. Use full-resolution products for measurement.
2. The source reports that panorama #2 (sol 4) crops distant peaks. Those peaks are missing observations.
3. Use [PDS Mars 2020 PLACES](https://pds-geosciences.wustl.edu/missions/mars2020/places.htm) records matched to the image time and site/drive. Read the SIS for coordinate definitions and accuracy. Reserve the external reference position for evaluating the completed search.

Most panoramas in the collection use simple cylindrical projection with north at the center, south at the edges and an elevation range of roughly −70° to +10°. Verify the individual product. Convert to project azimuth using the planetary or site-frame north definition, camera calibration and relevant attitude. Perspective and other cylindrical projections require their own vertical coordinate transformations.

## Terrain and geometry limits

The default Jezero CTX DEM covers 30 × 30 km. It replaces an earlier 9.7 × 7 km crop. The validity flag in skyline.profile checks that a ray reaches at least 1,200 m. Distant peaks may lie beyond the grid. Review the full line of sight for each image and mask unsupported rays. Increasing maxRange requires additional terrain. The global MOLA spacing is about 3.7 km and regional MOLA outputs have at least 4 km spacing. Finer DEMs are needed for individual ridges. Match vertical datums, Mars projections and camera heights.

## Evaluation tools

`node scripts/export-regions.mjs` crops the existing MOLA grid around the preset centers and writes regional DEMs to `.build/dem-regions/` by default. Output records the source hash, spacing and center elevation. These crops share one observational source. A preset region can also be loaded from the website.

`node scripts/evaluate-photo-horizon.mjs input.json result.json` consumes an angular skyline that has already been annotated and transformed using the camera geometry. The following schema shows example fields.

```text
schema: mars-photo-horizon-evaluation-v1
demPath: path to a DEM JSON in the observation coordinate system
provenance:
  imageUrl: original image product URL
  projectionSource: source of projection and attitude for this product
  annotationMethod: how the skyline was marked and occlusions handled
  referenceSource: external position record and identifier at the observation time
observation:
  kind: measured-photo-horizon
  angles: [0, 3, 6, ... 357] (evenly spaced around the full circle, including occlusions)
  elevations: elevation angle at each bearing, null where invalid
  valid: Boolean mask of the same length
  cameraHeight: camera height above the DEM surface, in meters
  options: {rayStep: 80, maxRange: 6000, curvature: true} (fix these for the DEM and experiment)
search:
  bounds: {minX, maxX, minY, maxY} (set in advance from the prior error)
  coarseStep: search spacing in meters
prior: {x, y} (prior position before correction in local DEM meters)
reference: {x, y} (external position used for scoring after the search)
```

The report gives the prior error, top candidate error, improvement in meters and candidate list. candidateImproves describes a single comparison. simulationThresholdStatus uses thresholds from the simulator. The tool does not apply automatic corrections. Provenance fields document the supplied annotation.

## Assessing position improvement

Fix the terrain extent, masks, annotation rules, search area, prior error, model and thresholds before evaluating other camera stations. Reserve a held-out group. Compare median and upper-quantile position error for the prior, dead reckoning and photo-based correction. Report the fractions improved, rejected and incorrectly corrected. Test wrong regions, limited field of view and dust occlusion. Report both acceptance rate and error after acceptance.

A claim of improvement under the tested conditions requires consistently lower held-out position errors after accounting for reference uncertainty and controlling incorrect corrections. Wheel-scale safety and other terrain types require separate evaluation.

## Screening Perseverance products

The [product catalog](photo-sites.json) covers four products at three independent stations, with download links, projection information and bracketing PLACES records. PLACES reports planetocentric latitude and east longitude. Camera center, attitude and terrain registration need verification. Rover body yaw alone does not give camera bearing. For multi-sol panoramas, verify site/drive for each exposure. The Van Zyl filename and catalog disagree on the final sol (64 and 63).

| Station | Product | Group | Evaluation status |
|---|---|---|---|
| Butler Landing | 01.02 left-eye natural-color panorama, sols 3 and 11 | Development | Excluded pending per-exposure geometry, reviewed traces and DEM masking. |
| Van Zyl | 03.02 left-eye natural-color panorama, sols 53–63 | Development | Excluded pending confirmation of exposure dates, camera geometry and coverage of distant peaks. |
| Horizon 2 | 05.02 left-eye natural-color panorama, sol 114 | Held out | Excluded pending a reviewed skyline and camera height. |
| Horizon 2 | ZL0_0114_0677061671, single frame, site 4/drive 1062 | Same held-out station | Excluded pending calibrated field of view, a valid skyline and a far-terrain mask. |

None of the four Perseverance products currently qualifies for scoring. All crops from a held-out station stay in that group. Rebuild the catalog with the commands below.

```sh
curl -fL https://mastcamz.asu.edu/mastcam-zs-360-panorama-collection/ -o /tmp/panoramas.html
curl -fL https://pds-geosciences.wustl.edu/m2020/urn-nasa-pds-mars2020_rover_places/data_localizations/best_interp.csv -o /tmp/places.csv
python3 scripts/catalog-photo-sites.py /tmp/panoramas.html /tmp/places.csv > docs/photo-sites.json
```

Before evaluation, fix each group’s prior, bounds, DEM version, camera height and ray settings. For a reviewed crop or single frame, observation.fovMask records whether each evenly spaced bearing falls in the field of view. A separate validity mask excludes obstructions and unsupported DEM rays. The evaluator reports valid angular extent, valid fraction within view, skyline relief, DEM overlap, score gap between the first two candidates and rejection reasons. Without a field-of-view mask, the within-view fraction is left blank. Heading error requires both headingSource and an external camera heading. The simulation threshold remains 50%. Limited views can still yield candidates for inspection.

A 720 × 360 level ideal skyline sampled every 3° through the perspective conversion retained 19, 39 and 50 bearings at fields of view of 60°, 120° and 150°. These are 15.8%, 32.5% and 41.7% of 120 full-circle bins. Each overlapped the ideal skyline completely with zero residual. All three were rejected because the skyline had no relief. Run `node tests/test_photo_evaluation.mjs` to reproduce the check.
