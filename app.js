/* Lusaka Minibus Guide
   Search functions are pure and covered by tests/search.test.js.
   The page code at the bottom only runs in a browser. */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.BusGuide = api;
    api.startApp();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAJOR_HUBS = new Set([
    "town",
    "kulima",
    "intercity",
    "manda-hill",
    "east-park",
    "unza",
    "soweto",
    "kabwata"
  ]);

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function normalise(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatFare(amount) {
    const number = Number(amount);
    if (!Number.isFinite(number)) return "ZMW ?";
    const text = Number.isInteger(number) ? String(number) : number.toFixed(2);
    return "ZMW " + text;
  }

  function formatDate(iso) {
    const parts = String(iso || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !part)) return iso || "";
    return parts[2] + " " + MONTHS[parts[1] - 1] + " " + parts[0];
  }

  function validateData(data) {
    const errors = [];
    if (!data || !Array.isArray(data.stops) || !Array.isArray(data.routes)) {
      return ["routes.json needs stops and routes arrays"];
    }
    const stopIds = new Set();
    data.stops.forEach((stop) => {
      if (!stop.id || !stop.name) {
        errors.push("A stop is missing an id or a name");
        return;
      }
      if (stopIds.has(stop.id)) errors.push("Duplicate stop id: " + stop.id);
      stopIds.add(stop.id);
    });
    const routeIds = new Set();
    data.routes.forEach((route) => {
      if (!route.id || !route.name) {
        errors.push("A route is missing an id or a name");
        return;
      }
      if (routeIds.has(route.id)) errors.push("Duplicate route id: " + route.id);
      routeIds.add(route.id);
      if (typeof route.fareZmw !== "number" || route.fareZmw <= 0) {
        errors.push(route.id + " needs a fareZmw greater than 0");
      }
      if (!Array.isArray(route.stops) || route.stops.length < 2) {
        errors.push(route.id + " needs at least two stops");
        return;
      }
      const seen = new Set();
      route.stops.forEach((id) => {
        if (!stopIds.has(id)) errors.push(route.id + " lists unknown stop " + id);
        if (seen.has(id)) errors.push(route.id + " lists " + id + " more than once");
        seen.add(id);
      });
    });
    return errors;
  }

  function rankStops(stops, query) {
    const q = normalise(query);
    if (!q) return [];
    const ranked = [];
    stops.forEach((stop) => {
      const fields = [stop.name, stop.short, stop.id].concat(stop.aliases || []);
      let score = 0;
      fields.forEach((field) => {
        const text = normalise(field);
        if (!text) return;
        if (text === q) score = Math.max(score, 100);
        else if (text.startsWith(q)) score = Math.max(score, 80);
        else if (text.includes(q)) score = Math.max(score, 60);
        else if (q.split(" ").every((word) => text.includes(word))) score = Math.max(score, 50);
      });
      if (score) ranked.push({ stop: stop, score: score });
    });
    ranked.sort((a, b) => b.score - a.score || a.stop.name.localeCompare(b.stop.name));
    return ranked;
  }

  function resolveStop(stops, query) {
    const q = normalise(query);
    if (!q) return { status: "empty" };
    const ranked = rankStops(stops, q);
    if (!ranked.length) return { status: "none", query: query };
    const top = ranked[0].score;
    const best = ranked.filter((entry) => entry.score === top);
    if (best.length === 1) return { status: "ok", stop: best[0].stop };
    const named = best.find((entry) => normalise(entry.stop.name) === q);
    if (named) return { status: "ok", stop: named.stop };
    return { status: "ambiguous", options: best.map((entry) => entry.stop) };
  }

  function suggestStops(stops, query) {
    const q = normalise(query);
    if (!q) {
      return stops
        .filter((stop) => stop.featured)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return rankStops(stops, q).slice(0, 8).map((entry) => entry.stop);
  }

  function legStops(route, fromId, toId) {
    if (!route || !Array.isArray(route.stops)) return [];
    const fromIndex = route.stops.indexOf(fromId);
    const toIndex = route.stops.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return [];
    if (fromIndex < toIndex) return route.stops.slice(fromIndex, toIndex + 1);
    return route.stops.slice(toIndex, fromIndex + 1).reverse();
  }

  function makeLeg(route, fromId, toId) {
    return {
      routeId: route.id,
      name: route.name,
      via: route.via || "",
      fareZmw: route.fareZmw,
      fromId: fromId,
      toId: toId,
      stopIds: legStops(route, fromId, toId)
    };
  }

  function findTrips(data, fromId, toId) {
    const empty = { direct: [], oneChange: [] };
    if (!data || fromId === toId) return empty;
    const routes = (data.routes || []).filter((route) =>
      Array.isArray(route.stops) && typeof route.fareZmw === "number"
    );

    const direct = [];
    routes.forEach((route) => {
      const stops = legStops(route, fromId, toId);
      if (stops.length < 2) return;
      direct.push({
        kind: "direct",
        fareZmw: route.fareZmw,
        changeAt: null,
        legs: [makeLeg(route, fromId, toId)]
      });
    });
    direct.sort((a, b) => a.fareZmw - b.fareZmw || a.legs[0].stopIds.length - b.legs[0].stopIds.length);

    const changes = [];
    routes.forEach((first) => {
      if (!first.stops.includes(fromId) || first.stops.includes(toId)) return;
      first.stops.forEach((hub) => {
        if (hub === fromId) return;
        routes.forEach((second) => {
          if (second.id === first.id) return;
          if (!second.stops.includes(hub) || !second.stops.includes(toId)) return;
          if (second.stops.includes(fromId) && second.stops.includes(toId)) return;
          changes.push({
            kind: "one-change",
            fareZmw: first.fareZmw + second.fareZmw,
            changeAt: hub,
            legs: [makeLeg(first, fromId, hub), makeLeg(second, hub, toId)]
          });
        });
      });
    });

    changes.sort((a, b) => {
      if (a.fareZmw !== b.fareZmw) return a.fareZmw - b.fareZmw;
      const hubA = MAJOR_HUBS.has(a.changeAt) ? 0 : 1;
      const hubB = MAJOR_HUBS.has(b.changeAt) ? 0 : 1;
      if (hubA !== hubB) return hubA - hubB;
      const stopsA = a.legs[0].stopIds.length + a.legs[1].stopIds.length;
      const stopsB = b.legs[0].stopIds.length + b.legs[1].stopIds.length;
      return stopsA - stopsB || a.changeAt.localeCompare(b.changeAt);
    });

    const cheapestDirect = direct.length ? direct[0].fareZmw : Infinity;
    const seenPairs = new Set();
    const oneChange = [];
    changes.forEach((trip) => {
      if (trip.fareZmw > cheapestDirect) return;
      const key = trip.legs[0].routeId + "|" + trip.legs[1].routeId;
      if (seenPairs.has(key)) return;
      seenPairs.add(key);
      oneChange.push(trip);
    });

    return { direct: direct, oneChange: oneChange.slice(0, 3) };
  }

  function startApp() {
    const els = {
      roll: document.getElementById("roll-text"),
      banner: document.getElementById("banner"),
      footer: document.getElementById("footer-disclaimer"),
      net: document.getElementById("net-status"),
      tabFind: document.getElementById("tab-find"),
      tabRoutes: document.getElementById("tab-routes"),
      panelFind: document.getElementById("panel-find"),
      panelRoutes: document.getElementById("panel-routes"),
      form: document.getElementById("search-form"),
      from: document.getElementById("from"),
      to: document.getElementById("to"),
      fromList: document.getElementById("from-suggestions"),
      toList: document.getElementById("to-suggestions"),
      swap: document.getElementById("swap"),
      go: document.getElementById("go"),
      examples: document.getElementById("examples"),
      results: document.getElementById("results"),
      filter: document.getElementById("route-filter"),
      routeList: document.getElementById("route-list"),
      stopList: document.getElementById("stop-list")
    };

    const state = { data: null, stopsById: new Map() };
    const active = { from: -1, to: -1 };

    function stops() {
      return state.data ? state.data.stops : [];
    }

    function stopName(id) {
      const stop = state.stopsById.get(id);
      return stop ? stop.name : id;
    }

    function setTab(name) {
      const find = name === "find";
      els.tabFind.setAttribute("aria-selected", find ? "true" : "false");
      els.tabRoutes.setAttribute("aria-selected", find ? "false" : "true");
      els.panelFind.hidden = !find;
      els.panelRoutes.hidden = find;
    }

    function setRoll(text) {
      els.roll.textContent = text;
    }

    function updateNet() {
      if (!navigator.onLine) {
        els.net.textContent = "Offline · using the saved sample routes.";
        return;
      }
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        els.net.textContent = "Offline copy saved on this device.";
        return;
      }
      els.net.textContent = "Online · an offline copy is saved after this visit.";
    }

    function registerWorker() {
      if (!("serviceWorker" in navigator)) {
        els.net.textContent = "Search works online. This browser cannot save an offline copy.";
        return;
      }
      navigator.serviceWorker.register("./sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(updateNet)
        .catch(() => {
          els.net.textContent = "Search works. The offline copy could not be saved in this browser.";
        });
    }

    function hideLists() {
      [els.fromList, els.toList].forEach((list) => {
        list.hidden = true;
        list.innerHTML = "";
      });
      els.from.setAttribute("aria-expanded", "false");
      els.to.setAttribute("aria-expanded", "false");
      active.from = -1;
      active.to = -1;
    }

    function fillList(which, query) {
      const list = which === "from" ? els.fromList : els.toList;
      const input = which === "from" ? els.from : els.to;
      const matches = suggestStops(stops(), query);
      list.innerHTML = "";
      active[which] = -1;
      if (!matches.length) {
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
        return;
      }
      matches.forEach((stop) => {
        const item = document.createElement("li");
        item.setAttribute("role", "presentation");
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "option");
        button.textContent = stop.name;
        if (stop.area) {
          const area = document.createElement("span");
          area.className = "hint";
          area.textContent = " · " + stop.area;
          button.appendChild(area);
        }
        button.addEventListener("mousedown", (event) => {
          event.preventDefault();
          input.value = stop.name;
          hideLists();
          input.focus();
        });
        item.appendChild(button);
        list.appendChild(item);
      });
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function moveActive(which, direction) {
      const list = which === "from" ? els.fromList : els.toList;
      const buttons = Array.from(list.querySelectorAll("button"));
      if (!buttons.length || list.hidden) return;
      const next = Math.max(0, Math.min(buttons.length - 1, active[which] + direction));
      active[which] = next;
      buttons.forEach((button, index) => {
        button.setAttribute("aria-selected", index === next ? "true" : "false");
      });
      buttons[next].scrollIntoView({ block: "nearest" });
    }

    function chooseActive(which) {
      const list = which === "from" ? els.fromList : els.toList;
      const input = which === "from" ? els.from : els.to;
      const buttons = Array.from(list.querySelectorAll("button"));
      if (list.hidden || active[which] < 0 || !buttons[active[which]]) return false;
      input.value = buttons[active[which]].childNodes[0].textContent;
      hideLists();
      return true;
    }

    function bindSuggest(which) {
      const input = which === "from" ? els.from : els.to;
      input.addEventListener("focus", () => fillList(which, input.value));
      input.addEventListener("input", () => fillList(which, input.value));
      input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveActive(which, 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          moveActive(which, -1);
        } else if (event.key === "Enter" && chooseActive(which)) {
          event.preventDefault();
        } else if (event.key === "Escape") {
          hideLists();
        }
      });
    }

    function rideHtml(stopIds) {
      const chips = stopIds.map((id) => '<span class="stop">' + escapeHtml(stopName(id)) + "</span>");
      const visual = chips.join('<span class="arrow" aria-hidden="true">→</span>');
      const spoken = stopIds.map(stopName).join(", ");
      return '<p class="sr-only">Stops in order: ' + escapeHtml(spoken) + "</p>" +
        '<p class="ride" aria-hidden="true">' + visual + "</p>";
    }

    function legHtml(leg, label) {
      return '<div class="leg"><div class="leg-top"><h4>' + escapeHtml(label) + " · " +
        escapeHtml(leg.name) + '</h4><p class="fare">' + escapeHtml(formatFare(leg.fareZmw)) +
        ' <span class="approx">approx.</span></p></div>' +
        (leg.via ? '<p class="via">' + escapeHtml(leg.via) + "</p>" : "") +
        rideHtml(leg.stopIds) + "</div>";
    }

    function renderTrips(fromStop, toStop, trips) {
      setRoll((fromStop.short || fromStop.name) + " → " + (toStop.short || toStop.name));
      const total = trips.direct.length + trips.oneChange.length;
      if (!total) {
        els.results.innerHTML = '<p class="message"><strong>No sample route within one change.</strong> Try a hub such as Town / City Market, Kulima Tower, or Manda Hill, or open All routes to see what this file includes.</p>';
        return;
      }
      const about = state.data.about || {};
      let html = '<div class="results-head"><h2>' + escapeHtml(fromStop.name) + " → " +
        escapeHtml(toStop.name) + "</h2><p>" + total + (total === 1 ? " way" : " ways") +
        " in this sample</p></div>";
      html += '<p class="fare-note">Sample fares compiled ' + escapeHtml(formatDate(about.sampleCompiled)) +
        ". Confirm every fare with the conductor.</p>";

      if (trips.direct.length) {
        html += '<p class="section-label">Direct</p>';
        trips.direct.forEach((trip) => {
          const leg = trip.legs[0];
          html += '<article class="card"><div class="card-top"><span class="badge">Direct</span><p class="fare">' +
            escapeHtml(formatFare(trip.fareZmw)) + ' <span class="approx">approx.</span></p></div><h3>' +
            escapeHtml(leg.name) + "</h3>" +
            (leg.via ? '<p class="via">' + escapeHtml(leg.via) + "</p>" : "") +
            rideHtml(leg.stopIds) +
            '<p class="fare-note">Sample flat fare for one boarding. Confirm it with the conductor.</p></article>';
        });
      }

      if (trips.oneChange.length) {
        html += '<p class="section-label">One change</p>';
        if (!trips.direct.length) {
          html += '<p class="fare-note">No direct sample route. These trips use two minibuses.</p>';
        }
        trips.oneChange.forEach((trip) => {
          html += '<article class="card change"><div class="card-top"><span class="badge change">1 change</span><p class="fare">' +
            escapeHtml(formatFare(trip.fareZmw)) + ' <span class="approx">approx.</span></p></div><h3>Change at ' +
            escapeHtml(stopName(trip.changeAt)) + "</h3>" +
            legHtml(trip.legs[0], "First bus") +
            legHtml(trip.legs[1], "Second bus") +
            '<p class="pay-note">You pay each time you board (' + escapeHtml(formatFare(trip.legs[0].fareZmw)) +
            " + " + escapeHtml(formatFare(trip.legs[1].fareZmw)) + "). Both amounts are samples.</p></article>";
        });
      }
      els.results.innerHTML = html;
      els.results.scrollIntoView({ block: "start" });
    }

    function renderIssue(title, detail) {
      els.results.innerHTML = '<p class="message"><strong>' + escapeHtml(title) + "</strong> " + escapeHtml(detail) + "</p>";
      els.results.scrollIntoView({ block: "start" });
    }

    function runSearch() {
      if (!state.data) return;
      hideLists();
      const fromResult = resolveStop(stops(), els.from.value);
      const toResult = resolveStop(stops(), els.to.value);
      const problem = describeResolve(fromResult, "From") || describeResolve(toResult, "To");
      if (problem) {
        setRoll("CHECK STOPS");
        renderIssue(problem.title, problem.detail);
        return;
      }
      if (fromResult.stop.id === toResult.stop.id) {
        setRoll(fromResult.stop.short || fromResult.stop.name);
        renderIssue("Those are the same stop.", "Pick a destination.");
        return;
      }
      const trips = findTrips(state.data, fromResult.stop.id, toResult.stop.id);
      renderTrips(fromResult.stop, toResult.stop, trips);
    }

    function describeResolve(result, label) {
      if (result.status === "ok") return null;
      if (result.status === "empty") {
        return { title: label + " is empty.", detail: "Type a stop such as Kulima Tower, Intercity, or Chilenje." };
      }
      if (result.status === "none") {
        return { title: "No sample stop matches that.", detail: "Open All routes to see the names in this file." };
      }
      const names = result.options.slice(0, 4).map((stop) => stop.name).join(", ");
      return { title: label + " matches more than one stop.", detail: names + "." };
    }

    function routeHaystack(route) {
      const names = route.stops.map((id) => stopName(id) + " " + id).join(" ");
      return normalise([route.name, route.via || "", names].join(" "));
    }

    function renderDirectory(query) {
      const q = normalise(query);
      const routes = state.data.routes.filter((route) => {
        if (!q) return true;
        return q.split(" ").every((word) => routeHaystack(route).includes(word));
      });
      const about = state.data.about || {};
      let html = '<p class="route-count">' + routes.length + " of " + state.data.routes.length +
        " sample routes. Fares compiled " + escapeHtml(formatDate(about.sampleCompiled)) +
        ". Each fare is approximate.</p>";
      if (!routes.length) {
        html += '<p class="message">No sample route mentions that. Try Kabwata, UNZA, or Matero.</p>';
      }
      routes.forEach((route) => {
        html += '<article class="card"><div class="card-top"><span class="badge">Route</span><p class="fare">' +
          escapeHtml(formatFare(route.fareZmw)) + ' <span class="approx">approx.</span></p></div><h3>' +
          escapeHtml(route.name) + "</h3>" +
          (route.via ? '<p class="via">' + escapeHtml(route.via) + "</p>" : "") +
          rideHtml(route.stops) +
          '<p class="fare-note">Sample flat fare for one boarding, either direction. Confirm it with the conductor.</p></article>';
      });
      els.routeList.innerHTML = html;

      const groups = new Map();
      state.data.stops.forEach((stop) => {
        const blob = normalise(stop.name + " " + stop.area + " " + (stop.aliases || []).join(" "));
        if (q && !q.split(" ").every((word) => blob.includes(word))) return;
        const area = stop.area || "Other";
        if (!groups.has(area)) groups.set(area, []);
        groups.get(area).push(stop);
      });
      let stopsHtml = "<h2>Stops in this sample</h2>";
      if (!groups.size) stopsHtml += '<p class="message">No stop name matches that filter.</p>';
      groups.forEach((list, area) => {
        stopsHtml += '<section class="group"><h3>' + escapeHtml(area) + '</h3><div class="stop-index">';
        list.forEach((stop) => {
          stopsHtml += '<span class="stop">' + escapeHtml(stop.name) + "</span>";
        });
        stopsHtml += "</div></section>";
      });
      els.stopList.innerHTML = stopsHtml;
    }

    els.tabFind.addEventListener("click", () => setTab("find"));
    els.tabRoutes.addEventListener("click", () => setTab("routes"));
    els.form.addEventListener("submit", (event) => {
      event.preventDefault();
      runSearch();
    });
    els.swap.addEventListener("click", () => {
      const current = els.from.value;
      els.from.value = els.to.value;
      els.to.value = current;
      hideLists();
      if (els.from.value && els.to.value) runSearch();
    });
    els.examples.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      els.from.value = button.dataset.from;
      els.to.value = button.dataset.to;
      setTab("find");
      runSearch();
    });
    els.filter.addEventListener("input", () => {
      if (state.data) renderDirectory(els.filter.value);
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".field")) hideLists();
    });
    window.addEventListener("online", updateNet);
    window.addEventListener("offline", updateNet);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", updateNet);
    }
    bindSuggest("from");
    bindSuggest("to");

    registerWorker();
    updateNet();

    fetch("./data/routes.json")
      .then((response) => {
        if (!response.ok) throw new Error("missing");
        return response.json();
      })
      .then((data) => {
        state.data = data;
        state.stopsById = new Map(data.stops.map((stop) => [stop.id, stop]));
        const about = data.about || {};
        const compiled = formatDate(about.sampleCompiled);
        els.banner.innerHTML = "<strong>Sample data.</strong> Routes and fares are approximate examples" +
          (compiled ? " compiled " + escapeHtml(compiled) : "") +
          ". They are not a live fare board. Confirm both with the conductor before you board.";
        if (about.disclaimer) {
          els.footer.innerHTML = "<strong>Sample / approximate data.</strong> " + escapeHtml(about.disclaimer);
        }
        const errors = validateData(data);
        if (errors.length) {
          els.results.innerHTML = '<p class="message"><strong>The sample file needs a fix before the search is reliable.</strong> ' +
            escapeHtml(errors.slice(0, 4).join(" ")) + "</p>";
        }
        renderDirectory("");
        els.go.disabled = false;
      })
      .catch(() => {
        setRoll("OFFLINE?");
        els.results.innerHTML = '<p class="message"><strong>The route list did not load.</strong> Open this guide once while you are online so the sample file can be saved on this phone. If you opened the HTML file directly, use a local server instead.</p>';
      });
  }

  return {
    normalise: normalise,
    validateData: validateData,
    resolveStop: resolveStop,
    suggestStops: suggestStops,
    legStops: legStops,
    findTrips: findTrips,
    formatFare: formatFare,
    startApp: startApp
  };
});
