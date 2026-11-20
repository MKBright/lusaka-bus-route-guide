const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const guide = require("../app.js");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/routes.json"), "utf8"));

test("sample data is labelled and valid", () => {
  assert.match(data.about.disclaimer, /SAMPLE DATA ONLY/);
  assert.equal(data.about.currency, "ZMW");
  assert.equal(data.about.sampleCompiled, "2026-11-20");
  assert.deepEqual(guide.validateData(data), []);
});

test("resolves names used in Lusaka", () => {
  assert.equal(guide.resolveStop(data.stops, "UNZA").stop.id, "unza");
  assert.equal(guide.resolveStop(data.stops, "city market").stop.id, "town");
  assert.equal(guide.resolveStop(data.stops, "pa Town").stop.id, "town");
  assert.equal(guide.resolveStop(data.stops, "soweto").stop.id, "soweto");
  assert.equal(guide.resolveStop(data.stops, "manda hill mall").stop.id, "manda-hill");
  assert.equal(guide.resolveStop(data.stops, "East Park").stop.id, "east-park");
  assert.equal(guide.resolveStop(data.stops, "University of Zambia").stop.id, "unza");
});

test("unknown and ambiguous queries stay unresolved", () => {
  assert.equal(guide.resolveStop(data.stops, "paris").status, "none");
  assert.equal(guide.resolveStop(data.stops, "market").status, "ambiguous");
  assert.equal(guide.resolveStop(data.stops, "   ").status, "empty");
});

test("Town to UNZA has a direct sample fare", () => {
  const trips = guide.findTrips(data, "town", "unza");
  assert.ok(trips.direct.length >= 1);
  assert.ok(trips.direct.some((trip) => trip.legs[0].routeId === "great-east-trunk"));
  assert.equal(trips.direct[0].fareZmw, 15);
  assert.deepEqual(trips.direct[0].legs[0].stopIds[0], "town");
  assert.equal(trips.direct[0].legs[0].stopIds.at(-1), "unza");
});

test("Matero to Chelston is a one-change trip and the fares add up", () => {
  const trips = guide.findTrips(data, "matero", "chelston");
  assert.equal(trips.direct.length, 0);
  assert.ok(trips.oneChange.length >= 1);
  const best = trips.oneChange[0];
  assert.equal(best.fareZmw, best.legs[0].fareZmw + best.legs[1].fareZmw);
  assert.ok(best.changeAt);
  assert.equal(best.legs[0].stopIds.at(-1), best.changeAt);
  assert.equal(best.legs[1].stopIds[0], best.changeAt);
});

test("Chilenje to Kalingalinga and Soweto to Woodlands both return a ride", () => {
  const east = guide.findTrips(data, "chilenje", "kalingalinga");
  assert.ok(east.direct.length + east.oneChange.length > 0);
  const south = guide.findTrips(data, "soweto", "woodlands");
  assert.ok(south.direct.some((trip) => trip.legs[0].routeId === "soweto-chilenje"));
});

test("a route is searched in reverse", () => {
  const route = data.routes.find((item) => item.id === "south-trunk");
  const stops = guide.legStops(route, "woodlands", "town");
  assert.equal(stops[0], "woodlands");
  assert.equal(stops.at(-1), "town");
  assert.ok(stops.indexOf("chilenje") < stops.indexOf("kabwata"));
});

test("a dearer change is hidden when a direct bus is cheaper", () => {
  const trips = guide.findTrips(data, "town", "unza");
  assert.equal(trips.oneChange.length, 0);
  const south = guide.findTrips(data, "soweto", "woodlands");
  south.oneChange.forEach((trip) => {
    assert.ok(trip.fareZmw <= south.direct[0].fareZmw);
  });
});

test("a direct bus is not also offered as the first leg of a change", () => {
  const trips = guide.findTrips(data, "town", "matero");
  assert.ok(trips.direct.length >= 1);
  trips.oneChange.forEach((trip) => {
    assert.notEqual(trip.legs[0].routeId, trip.legs[1].routeId);
    const first = data.routes.find((route) => route.id === trip.legs[0].routeId);
    assert.equal(first.stops.includes("matero"), false);
  });
});

test("the same stop is not a trip", () => {
  const trips = guide.findTrips(data, "kabwata", "kabwata");
  assert.equal(trips.direct.length, 0);
  assert.equal(trips.oneChange.length, 0);
});

test("every stop can reach every other stop within one change", () => {
  const missing = [];
  data.stops.forEach((from) => {
    data.stops.forEach((to) => {
      if (from.id === to.id) return;
      const trips = guide.findTrips(data, from.id, to.id);
      if (!trips.direct.length && !trips.oneChange.length) {
        missing.push(from.id + " -> " + to.id);
      }
    });
  });
  assert.deepEqual(missing, []);
});
