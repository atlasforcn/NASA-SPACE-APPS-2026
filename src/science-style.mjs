export const rasterScales = { thermal: [0, 1000], spectral: [0, 0.25], geophysical: [-500, 500], chemical: [10, 20] };
export const palettes = {
  heat: [[30, 48, 112], [58, 173, 177], [250, 211, 79], [204, 54, 51]],
  terrain: [[42, 76, 125], [87, 157, 123], [232, 204, 116], [151, 74, 54]],
  gray: [[25, 32, 42], [100, 111, 123], [185, 194, 199], [250, 250, 242]],
};

export function colorizeScienceGrid(values, width, height, min, max, palette = 'heat') {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const stops = palettes[palette] || palettes.heat;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    const t = Math.max(0, Math.min(1, (value - min) / (max - min))) * (stops.length - 1);
    const a = Math.min(stops.length - 2, Math.floor(t));
    const blend = t - a;
    for (let channel = 0; channel < 3; channel++)
      image.data[i * 4 + channel] = stops[a][channel] * (1 - blend) + stops[a + 1][channel] * blend;
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
