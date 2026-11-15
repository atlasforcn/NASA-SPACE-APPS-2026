// Curated published observations. These are not interpolated into point measurements.
// Region tags select context for the loaded local site, not an observation footprint.
export const scienceRecords = [
  { id: 'thermal', name: 'Thermal', scope: 'global', period: '2009 study · THEMIS nighttime infrared',
    text: 'THEMIS nighttime imagery samples about 100 m/pixel. This study used thermal inertia above 1,200 J m⁻² K⁻¹ s⁻½ to identify bedrock or rock-dominated surfaces.',
    limit: 'This threshold comes from the study. No destination pixels were sampled to determine local material or temperature.',
    url: 'https://pubs.usgs.gov/publication/70037394', source: 'USGS/Edwards et al. (2009)' },
  { id: 'spectral', name: 'Spectral', scope: 'jezero', period: 'Published 2020 · MRO CRISM orbital observations',
    text: 'CRISM identified a spatial association between olivine and carbonates in Jezero, which the study used to investigate carbonate formation.',
    limit: 'The regional mineral study did not sample spectra at the selected coordinates. Mineralogy varies across the region.',
    url: 'https://astrobiology.nasa.gov/news/serpenitinzation-and-astrobiological-potential-of-the-mars-2020-landing-site/', source: 'NASA Astrobiology/CRISM' },
  { id: 'geophysical', name: 'Geophysics', scope: 'global', period: 'InSight mission (2018–2022)',
    text: 'InSight recorded more than 1,300 seismic events. Its magnetometer also detected ancient magnetization preserved in the crust.',
    limit: 'InSight observed Elysium Planitia. The observations describe the subsurface there.',
    url: 'https://science.nasa.gov/mission/insight/science-highlights/', source: 'NASA · InSight science results' },
  { id: 'atmospheric', name: 'Atmosphere', scope: 'jezero', period: 'First measurement February 19, 2021 · published April 6, 2021',
    text: 'MEDA’s first reported pressure in Jezero was 718 Pa. The temperature started just below −20 °C and fell to −25.6 °C after 30 minutes.',
    limit: 'Historical conditions at Perseverance’s location. Current weather and conditions at the selected coordinates require separate measurements.',
    url: 'https://www.jpl.nasa.gov/news/nasas-first-weather-report-from-jezero-crater-on-mars/', source: 'NASA/JPL · MEDA’s first weather report' },
  { id: 'radiation', name: 'Radiation', scope: 'gale', period: 'August 2012–June 2013 · Curiosity RAD',
    text: 'The average surface radiation dose equivalent rate at Gale during this period was about 0.67 mSv/day.',
    limit: 'Historical average for the observation period. Solar activity and shielding affect exposure at a destination.',
    url: 'https://www.nasa.gov/news-release/nasa-rover-results-include-first-age-measurement-on-mars-and-help-for-human-exploration/', source: 'NASA · Curiosity RAD (2013 report)' },
  { id: 'chemical', name: 'Chemistry', scope: 'jezero', period: '2021 crater floor investigation · 2023 synthesis',
    text: 'Perseverance found carbonates or iron-magnesium phyllosilicates, salts and amorphous silicates in Máaz and Séítah crater floor rocks, evidence of alteration by water.',
    limit: 'These samples characterize rocks along the historical traverse. Composition and concentration at the selected site require local observations.',
    url: 'https://ntrs.nasa.gov/api/citations/20230016431/downloads/Sun%20et%20al%202023%20JGR%20Planets%20Jezero%20Campaign.pdf', source: 'NASA NTRS/Sun et al. (2023)' },
  { id: 'chemical', name: 'Chemistry', scope: 'gale', period: 'Published March 12, 2013 · Yellowknife Bay drill sample',
    text: 'Curiosity’s CheMin analysis found at least 20% clay minerals in this mudstone drill sample.',
    limit: 'The mineral percentage describes this drill sample. Other locations in Gale may differ.',
    url: 'https://www.jpl.nasa.gov/news/nasa-rover-finds-conditions-once-suited-for-ancient-life-on-mars/', source: 'NASA/JPL · CheMin rock sample analysis' },
];

export function recordsForSite(siteId, regional) {
  return scienceRecords.filter(r => r.scope === 'global' || (!regional && r.scope === siteId));
}
