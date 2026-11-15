// Local DEM and orthoimage presets; centres are not rover positions.
export default [
  {
    id: 'jezero', name: 'Jezero', title: '傑澤羅隕石坑', english: 'Jezero Crater',
    lat: 18.44, lng: 77.42, image: 'data/jezero-extended/optical.png',
    description: '古河流曾把泥沙帶入湖中，在河口堆出三角洲。切換地質圖，比較 A、B 兩站腳下的地質單元。',
  },
  {
    id: 'gale', name: 'Gale', title: '蓋爾隕石坑', english: 'Gale Crater',
    lat: -4.59, lng: 137.44, image: 'data/gale/optical.png',
    description: '好奇號在夏普山麓的岩層中找到古湖泊的證據。打開坡度圖，看看從坑底前往較高處時，哪些坡面需要繞行。',
  },
  {
    id: 'valles-ctx', name: 'Valles', title: '水手號峽谷', english: 'Valles Marineris',
    lat: -10, lng: -69.3, image: 'data/valles/optical.png',
    description: '這片峽谷群沿火星赤道延伸數千公里。用局部高程圖辨認谷壁與低地，再查看兩點之間的路線剖面。',
  },
];
