export const asset = (path) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
export async function json(path, options) {
  const response = await fetch(asset(path), options);
  if (!response.ok) throw Error(`${path} failed to load (${response.status})`);
  return response.json();
}
