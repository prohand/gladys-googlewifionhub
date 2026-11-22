// -----------------------------------------------------------------------------
// A fake `fetch` standing in for the router and the Google APIs: tests never
// touch the network. Routes are matched on "METHOD url-without-query"; a route
// is a JSON body, a function (request) => body, or a Response-like object
// built with `reply(status, body)`. Every request is recorded.
// -----------------------------------------------------------------------------

export function reply(status, body) {
  return { __reply: true, status, body };
}

export function createFakeFetch(routes = {}) {
  const calls = [];
  async function fakeFetch(url, init = {}) {
    const method = (init.method ?? 'GET').toUpperCase();
    const bare = String(url).split('?')[0];
    const call = {
      method,
      url: String(url),
      path: bare,
      headers: init.headers ?? {},
      body: init.body,
    };
    calls.push(call);
    let route = fakeFetch.routes[`${method} ${bare}`];
    if (route === undefined) {
      throw new TypeError(`fetch failed (no route for ${method} ${bare})`);
    }
    if (typeof route === 'function') {
      route = await route(call);
    }
    if (route instanceof Error) {
      throw route;
    }
    const { status, body } = route?.__reply ? route : { status: 200, body: route };
    const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return JSON.parse(text);
      },
      async text() {
        return text;
      },
    };
  }
  fakeFetch.routes = routes;
  fakeFetch.calls = calls;
  return fakeFetch;
}
