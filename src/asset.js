export const asset = (path) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
export async function json(path, options) {
  const response = await fetch(asset(path), options);
  if (!response.ok) throw Error(`${path} 載入失敗 (${response.status})`);
  return response.json();
}
