// Local DEM and orthoimage presets; centres are not rover positions.
export default [
  {
    id: 'jezero', name: 'Jezero', title: 'Jezero Crater', english: 'Jezero Crater',
    lat: 18.44, lng: 77.42, cellMeters: 40, image: 'data/jezero-extended/optical.png',
    question: 'Which geological units would you cross on the way from the crater floor to the ancient delta?',
    description: 'An ancient river carried sediment into the lake and built a delta at its mouth. The geological map shows surface units formed at different times.',
  },
  {
    id: 'gale', name: 'Gale', title: 'Gale Crater', english: 'Gale Crater',
    lat: -4.59, lng: 137.44, cellMeters: 20, image: 'data/gale/optical.png',
    question: 'Where are the steepest slopes on the climb from the crater floor?',
    description: 'Curiosity found evidence of an ancient lake in the rocks at the foot of Mount Sharp. Open the slope map to find a way around steep ground.',
  },
  {
    id: 'valles-ctx', name: 'Valles', title: 'Valles Marineris', english: 'Valles Marineris',
    lat: -10, lng: -69.3, cellMeters: 40, image: 'data/valles/optical.png',
    question: 'How do the slopes of the canyon walls compare with the valley floor?',
    description: 'This canyon system extends thousands of kilometers along the Martian equator. Find the walls and lowlands on the elevation map, then compare them in a route elevation profile.',
  },
];
