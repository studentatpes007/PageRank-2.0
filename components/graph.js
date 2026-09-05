/**
 * components/graph.js
 * -----------------------------------------------------------------------
 * Renders the directed webpage graph as SVG and handles its interactions:
 * dragging nodes, selecting a source/destination pair while "Add link"
 * mode is active, and highlighting a node/edge when the rest of the app
 * asks it to (e.g. hovering a ranking row).
 *
 * This file only knows about drawing and interaction. It never computes
 * PageRank — it just reflects whatever state app.js hands it.
 * -----------------------------------------------------------------------
 */
(function (global) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const NODE_RADIUS = 26;
  const VIEW_W = 900;
  const VIEW_H = 460;

  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach((k) => node.setAttribute(k, attrs[k]));
    return node;
  }

  /**
   * Assign a resting position to any node that doesn't have one yet,
   * arranging all positionless nodes evenly around a circle. Nodes that
   * already have coordinates (e.g. the user dragged them) are left alone.
   */
  function layoutNodes(nodes) {
    const missing = nodes.filter((n) => n.x === undefined || n.y === undefined);
    if (missing.length === 0) return;

    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const radius = Math.min(VIEW_W, VIEW_H) / 2 - 80;
    const total = nodes.length;

    nodes.forEach((n, i) => {
      if (n.x !== undefined && n.y !== undefined) return;
      const angle = (2 * Math.PI * i) / total - Math.PI / 2;
      n.x = cx + radius * Math.cos(angle);
      n.y = cy + radius * Math.sin(angle);
    });
  }

  function ensureGridPattern(svg) {
    if (svg.querySelector("#grid-pattern")) return;
    const defs = svg.querySelector("defs");
    const pattern = el("pattern", {
      id: "grid-pattern",
      width: 28,
      height: 28,
      patternUnits: "userSpaceOnUse",
    });
    pattern.appendChild(el("circle", { cx: 1.4, cy: 1.4, r: 1.4, class: "grid-dot" }));
    defs.appendChild(pattern);
  }

  function drawGrid(svg) {
    ensureGridPattern(svg);
    const layer = svg.querySelector("#grid-layer");
    layer.innerHTML = "";
    layer.appendChild(el("rect", { x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: "url(#grid-pattern)" }));
  }

  /** Point on the circumference of a node, `radius` away from its center, facing `toward`. */
  function pointToward(from, toward, radius) {
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    return { x: from.x + (dx / dist) * radius, y: from.y + (dy / dist) * radius };
  }

  function hasReverseEdge(edges, edge) {
    return edges.some((e) => e.from === edge.to && e.to === edge.from);
  }

  /**
   * render(svg, state, handlers)
   * state: {
   *   nodes: [{id, x, y}],
   *   edges: [{from, to}],
   *   linkSource: string|null,   // node id chosen as source while linking
   *   highlightId: string|null,  // node id to highlight (from ranking/matrix hover)
   *   topId: string|null         // top-ranked node id, once known
   * }
   * handlers: { onNodeClick(id), onNodeHover(id|null), onNodeMove(id, x, y) }
   */
  function render(svg, state, handlers) {
    layoutNodes(state.nodes);
    drawGrid(svg);

    const nodeById = new Map(state.nodes.map((n) => [n.id, n]));
    const edgeLayer = svg.querySelector("#edge-layer");
    const nodeLayer = svg.querySelector("#node-layer");
    edgeLayer.innerHTML = "";
    nodeLayer.innerHTML = "";

    // --- edges ---
    state.edges.forEach((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) return;

      const start = pointToward(from, to, NODE_RADIUS + 2);
      const end = pointToward(to, from, NODE_RADIUS + 6);

      const curved = hasReverseEdge(state.edges, edge);
      let d;
      if (curved) {
        const mx = (start.x + end.x) / 2;
        const my = (start.y + end.y) / 2;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.hypot(dx, dy) || 1;
        const curveAmount = 22;
        const nx = -dy / len;
        const ny = dx / len;
        const cx = mx + nx * curveAmount;
        const cy = my + ny * curveAmount;
        d = `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`;
      } else {
        d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
      }

      const isHighlighted =
        state.highlightId && (edge.from === state.highlightId || edge.to === state.highlightId);

      const path = el("path", {
        d,
        class: "edge-line" + (isHighlighted ? " is-highlighted" : ""),
        "data-from": edge.from,
        "data-to": edge.to,
      });
      edgeLayer.appendChild(path);
    });

    // --- nodes ---
    state.nodes.forEach((n) => {
      const group = el("g", { class: "node-group", "data-id": n.id, transform: `translate(${n.x}, ${n.y})` });

      const classes = ["node-group"];
      if (n.id === state.linkSource) classes.push("is-selected");
      if (n.id === state.highlightId) classes.push("is-highlighted");
      if (n.id === state.topId) classes.push("is-top");
      group.setAttribute("class", classes.join(" "));

      const circle = el("circle", { class: "node-circle", r: NODE_RADIUS, cx: 0, cy: 0 });
      const label = el("text", { class: "node-label", x: 0, y: 1 });
      label.textContent = n.id;

      group.appendChild(circle);
      group.appendChild(label);
      nodeLayer.appendChild(group);

      // --- interaction: click to select (link mode) + drag to reposition ---
      let dragging = false;
      let moved = false;
      let startPointer = { x: 0, y: 0 };
      let originNode = { x: 0, y: 0 };

      function toSvgPoint(evt) {
        const rect = svg.getBoundingClientRect();
        const scaleX = VIEW_W / rect.width;
        const scaleY = VIEW_H / rect.height;
        return {
          x: (evt.clientX - rect.left) * scaleX,
          y: (evt.clientY - rect.top) * scaleY,
        };
      }

      group.addEventListener("pointerdown", (evt) => {
        dragging = true;
        moved = false;
        startPointer = toSvgPoint(evt);
        originNode = { x: n.x, y: n.y };
        if (group.setPointerCapture) group.setPointerCapture(evt.pointerId);
      });

      group.addEventListener("pointermove", (evt) => {
        if (!dragging) return;
        const p = toSvgPoint(evt);
        const dx = p.x - startPointer.x;
        const dy = p.y - startPointer.y;
        if (Math.hypot(dx, dy) > 3) moved = true;
        if (moved) {
          n.x = Math.max(NODE_RADIUS, Math.min(VIEW_W - NODE_RADIUS, originNode.x + dx));
          n.y = Math.max(NODE_RADIUS, Math.min(VIEW_H - NODE_RADIUS, originNode.y + dy));
          group.setAttribute("transform", `translate(${n.x}, ${n.y})`);
          redrawEdgesOnly(svg, state);
        }
      });

      group.addEventListener("pointerup", (evt) => {
        dragging = false;
        if (group.releasePointerCapture) group.releasePointerCapture(evt.pointerId);
        if (!moved && handlers.onNodeClick) handlers.onNodeClick(n.id);
        if (moved && handlers.onNodeMove) handlers.onNodeMove(n.id, n.x, n.y);
      });

      group.addEventListener("pointerenter", () => handlers.onNodeHover && handlers.onNodeHover(n.id));
      group.addEventListener("pointerleave", () => handlers.onNodeHover && handlers.onNodeHover(null));
    });
  }

  /** Cheap redraw used mid-drag: only the edges move, node positions are set directly by the caller. */
  function redrawEdgesOnly(svg, state) {
    const nodeById = new Map(state.nodes.map((n) => [n.id, n]));
    const edgeLayer = svg.querySelector("#edge-layer");
    edgeLayer.innerHTML = "";
    state.edges.forEach((edge) => {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) return;
      const start = pointToward(from, to, NODE_RADIUS + 2);
      const end = pointToward(to, from, NODE_RADIUS + 6);
      const curved = hasReverseEdge(state.edges, edge);
      let d;
      if (curved) {
        const mx = (start.x + end.x) / 2;
        const my = (start.y + end.y) / 2;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.hypot(dx, dy) || 1;
        const curveAmount = 22;
        const nx = -dy / len;
        const ny = dx / len;
        d = `M ${start.x} ${start.y} Q ${mx + nx * curveAmount} ${my + ny * curveAmount} ${end.x} ${end.y}`;
      } else {
        d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
      }
      edgeLayer.appendChild(el("path", { d, class: "edge-line", "data-from": edge.from, "data-to": edge.to }));
    });
  }

  /** Briefly animates every edge to suggest rank "flowing" through the graph when a calculation starts. */
  function pulseEdges(svg) {
    svg.querySelectorAll(".edge-line").forEach((path) => {
      path.classList.remove("is-flowing");
      // Force reflow so the animation restarts if triggered twice quickly.
      void path.getBoundingClientRect();
      path.classList.add("is-flowing");
    });
  }

  global.PR = global.PR || {};
  global.PR.Graph = { render, pulseEdges, NODE_RADIUS };
})(window);
