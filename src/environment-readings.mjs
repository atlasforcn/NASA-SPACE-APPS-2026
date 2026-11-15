import { computed, reactive } from 'vue';
import C from '../core.mjs';
import manifest from '../data/science/manifest.json';
import { temperatureHistory } from './layer-guidance.mjs';

const rad = manifest.datasets.radiation;
const sensors = [
  { id: 'temperature', label: 'Air temperature', unit: '°C', min: -273.15, stations: temperatureHistory },
  { id: 'radiation', label: 'Radiation', unit: rad.unit, min: 0, stations: [{
    lat: rad.lat, lng: rad.lng, station: 'Gale · ' + rad.name, period: rad.start.slice(0, 10),
    reading: rad.count + ' samples, maximum silicon absorbed dose rate', value: rad.max, url: rad.label_source.url,
  }] },
];

export function useEnvironmentReadings(s, dem) {
  const limits = reactive({ temperature: -20, radiation: 9 });
  const loading = computed(() => !s.ready || s.regionLoading || !dem.value);
  const area = computed(() => s.globalView ? 'Current map view' : 'Current mission region');

  function includesStation(station) {
    if (s.globalView) {
      const view = s.guidanceView;
      if (!view || station.lat < view.south || station.lat > view.north) return false;
      const longitude = station.lng + 360 * Math.ceil((view.west - station.lng) / 360);
      return longitude <= view.east;
    }
    const grid = dem.value;
    const { x, y } = C.latLngToLocal(station.lat, station.lng);
    return x >= grid.xMin && x <= grid.xMax && y >= grid.yMin && y <= grid.yMax;
  }

  const checks = computed(() => sensors.map(sensor => {
    const limit = limits[sensor.id];
    const valid = Number.isFinite(limit) && limit >= sensor.min;
    const stations = loading.value ? [] : sensor.stations.filter(includesStation)
      .filter(station => Number.isFinite(station.value));
    const overLimit = stations.filter(station => valid && station.value > limit);
    return { ...sensor, limit, valid, stations, overLimit };
  }));
  return { limits, checks, loading, area };
}
