import { createSession } from "wreq-js";

const session = await createSession({
  browser: "chrome_142",
  os: "windows",
});

export async function fetch(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    body,
    redirect = "follow",
  } = options;

  return session.fetch(url, {
    method,
    headers,
    body,
    redirect,
  });
}