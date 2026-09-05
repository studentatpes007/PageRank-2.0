/**
 * app.js
 * -----------------------------------------------------------------------
 * Wires the DOM to the three view components (PR.Graph, PR.Matrix,
 * PR.Ranking) and the API adapter (PR.Api). Owns the single source of
 * truth for the graph the user is building and the last result the
 * PageRank service returned. No PageRank mathematics lives here.
 * -----------------------------------------------------------------------
 */
(function () {
  "use strict";

  const MAX_NODES = 10;
  const NODE_LETTERS = "ABCDEFGHIJ";

  const state = {
    nodes: [], // {id, x, y}
    edges: [], // {from, to}
    linkMode: false,
    linkSource: null,
    hoverId: null,
    selectedId: null,
    topId: null,
    result: null, // normalized result from PR.Api
    status: "idle", // idle | loading | error
    activeMatrixTab: "transition",
  };

  // --- DOM references ---
  const svg = document.getElementById("graph-svg");
  const graphEmpty = document.getElementById("graph-empty");
  const graphMessage = document.getElementById("graph-message");
  const modeHint = document.getElementById("mode-hint");
  const chipList = document.getElementById("edge-chip-list");
  const chipEmpty = document.getElementById("edge-chip-empty");
  const matrixContainer = document.getElementById("matrix-container");
  const matrixLede = document.getElementById("matrix-lede");
  const calcContainer = document.getElementById("calc-container");
  const rankingContainer = document.getElementById("ranking-container");
  const dataSourceNote = document.getElementById("data-source-note");

  const btnAddPage = document.getElementById("btn-add-page");
  const btnLinkMode = document.getElementById("btn-link-mode");
  const btnExample = document.getElementById("btn-example");
  const btnClear = document.getElementById("btn-clear");
  const btnCalculate = document.getElementById("btn-calculate");

  // =========================================================================
  // Helpers
  // =========================================================================
  function effectiveHighlight() {
    return state.hoverId || state.selectedId || null;
  }

  function nextLabel() {
    const used = new Set(state.nodes.map((n) => n.id));
    for (const letter of NODE_LETTERS) {
      if (!used.has(letter)) return letter;
    }
    return null;
  }

  function showMessage(text) {
    graphMessage.textContent = text;
    graphMessage.hidden = false;
  }

  function clearMessage() {
    graphMessage.hidden = true;
    graphMessage.textContent = "";
  }

  function invalidateResult() {
    state.result = null;
    state.topId = null;
    matrixContainer.innerHTML = '<p class="placeholder">Create a graph and calculate PageRank to see the mathematics.</p>';
    calcContainer.innerHTML = '<p class="placeholder">Create a graph and calculate PageRank to see the mathematics.</p>';
    rankingContainer.innerHTML = '<p class="placeholder">Create a graph and calculate PageRank to see the mathematics.</p>';
  }

  // =========================================================================
  // Rendering
  // =========================================================================
  function renderGraph() {
    graphEmpty.hidden = state.nodes.length > 0;
    PR.Graph.render(
      svg,
      {
        nodes: state.nodes,
        edges: state.edges,
        linkSource: state.linkSource,
        highlightId: effectiveHighlight(),
        topId: state.topId,
      },
      {
        onNodeClick: handleNodeClick,
        onNodeHover: handleGraphHover,
        onNodeMove: function () {}, // position already mutated in place by graph.js
      }
    );
  }

  function renderEdgeChips() {
    chipList.innerHTML = "";
    state.edges.forEach((edge) => {
      const li = document.createElement("li");
      li.className = "chip";
      const text = document.createElement("span");
      text.textContent = edge.from + " \u2192 " + edge.to;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove link " + edge.from + " to " + edge.to);
      remove.textContent = "\u00d7";
      remove.addEventListener("click", () => removeEdge(edge.from, edge.to));
      li.appendChild(text);
      li.appendChild(remove);
      chipList.appendChild(li);
    });
    chipEmpty.hidden = state.edges.length > 0;
  }

  function renderActiveMatrix() {
    if (!state.result) return;
    const data = state.activeMatrixTab === "adjacency" ? state.result.adjacencyMatrix : state.result.transitionMatrix;
    PR.Matrix.renderMatrix(matrixContainer, state.result.nodes, data, {
      highlightId: effectiveHighlight(),
      onCellHover: handleMatrixHover,
      decimals: state.activeMatrixTab === "adjacency" ? 0 : 2,
    });
  }

  function renderRankingList() {
    if (!state.result) return;
    PR.Ranking.renderRanking(rankingContainer, state.result, {
      highlightId: effectiveHighlight(),
      onRowHover: handleRankingHover,
      onRowClick: handleRankingClick,
    });
  }

  function renderCalculation() {
    if (!state.result) return;
    PR.Ranking.renderCalculation(calcContainer, state.result);
  }

  // =========================================================================
  // Cross-component hover / selection
  // A hover originating in one component re-renders the *other two* only —
  // the source component already shows feedback via plain CSS :hover.
  // =========================================================================
  function handleGraphHover(id) {
    state.hoverId = id;
    renderActiveMatrix();
    renderRankingList();
  }

  function handleMatrixHover(id) {
    state.hoverId = id;
    renderGraph();
    renderRankingList();
  }

  function handleRankingHover(id) {
    state.hoverId = id;
    renderGraph();
    renderActiveMatrix();
  }

  function handleRankingClick(id) {
    state.selectedId = state.selectedId === id ? null : id;
    renderGraph();
    renderActiveMatrix();
    renderRankingList();
  }

  // =========================================================================
  // Graph editing
  // =========================================================================
  function addPage() {
    if (state.nodes.length >= MAX_NODES) {
      showMessage("A graph of up to " + MAX_NODES + " pages is plenty to see the mathematics clearly.");
      return;
    }
    const label = nextLabel();
    if (!label) return;
    state.nodes.push({ id: label });
    clearMessage();
    invalidateResult();
    renderGraph();
  }

  function handleNodeClick(id) {
    if (state.linkMode) {
      handleLinkClick(id);
      return;
    }
    state.selectedId = state.selectedId === id ? null : id;
    renderGraph();
    renderActiveMatrix();
    renderRankingList();
  }

  function handleLinkClick(id) {
    if (!state.linkSource) {
      state.linkSource = id;
      updateModeHint();
      renderGraph();
      return;
    }
    if (state.linkSource === id) {
      showMessage("A page cannot link to itself.");
      state.linkSource = null;
      updateModeHint();
      renderGraph();
      return;
    }
    const duplicate = state.edges.some((e) => e.from === state.linkSource && e.to === id);
    if (duplicate) {
      showMessage("That link already exists.");
      state.linkSource = null;
      updateModeHint();
      renderGraph();
      return;
    }
    state.edges.push({ from: state.linkSource, to: id });
    state.linkSource = null;
    clearMessage();
    updateModeHint();
    invalidateResult();
    renderGraph();
    renderEdgeChips();
  }

  function removeEdge(from, to) {
    state.edges = state.edges.filter((e) => !(e.from === from && e.to === to));
    invalidateResult();
    renderGraph();
    renderEdgeChips();
  }

  function toggleLinkMode() {
    state.linkMode = !state.linkMode;
    state.linkSource = null;
    btnLinkMode.setAttribute("aria-pressed", String(state.linkMode));
    modeHint.hidden = !state.linkMode;
    updateModeHint();
    renderGraph();
  }

  function updateModeHint() {
    if (!state.linkMode) return;
    modeHint.textContent = state.linkSource
      ? "Now choose a destination page for " + state.linkSource + "."
      : "Select a source page, then a destination page, to create a link.";
  }

  function loadExample() {
    state.nodes = [{ id: "A" }, { id: "B" }, { id: "C" }];
    state.edges = [
      { from: "A", to: "B" },
      { from: "A", to: "C" },
      { from: "B", to: "C" },
      { from: "C", to: "A" },
    ];
    state.linkMode = false;
    state.linkSource = null;
    state.selectedId = null;
    state.hoverId = null;
    btnLinkMode.setAttribute("aria-pressed", "false");
    modeHint.hidden = true;
    clearMessage();
    invalidateResult();
    renderGraph();
    renderEdgeChips();
  }

  function clearAll() {
    state.nodes = [];
    state.edges = [];
    state.linkMode = false;
    state.linkSource = null;
    state.selectedId = null;
    state.hoverId = null;
    btnLinkMode.setAttribute("aria-pressed", "false");
    modeHint.hidden = true;
    clearMessage();
    invalidateResult();
    renderGraph();
    renderEdgeChips();
  }

  // =========================================================================
  // Calculate
  // =========================================================================
  async function calculate() {
    if (state.nodes.length < 2) {
      showMessage("Add at least two pages to calculate PageRank.");
      return;
    }
    if (state.edges.length < 1) {
      showMessage("Add at least one link between pages.");
      return;
    }
    clearMessage();

    state.status = "loading";
    btnCalculate.disabled = true;
    btnCalculate.innerHTML = '<span class="spinner"></span>Calculating\u2026';
    PR.Graph.pulseEdges(svg);

    const graphData = {
      nodes: state.nodes.map((n) => n.id),
      edges: state.edges.map((e) => ({ from: e.from, to: e.to })),
    };

    try {
      const result = await PR.Api.calculatePageRank(graphData);
      state.result = result;
      state.status = "idle";
      state.topId = result.ranking.length ? result.ranking[0].node : null;
      renderGraph();
      renderActiveMatrix();
      renderCalculation();
      renderRankingList();
    } catch (err) {
      state.status = "error";
      const banner = '<div class="error-banner">Unable to connect to the PageRank computation service.</div>';
      matrixContainer.innerHTML = banner;
      calcContainer.innerHTML = banner;
      rankingContainer.innerHTML = banner;
    } finally {
      btnCalculate.disabled = false;
      btnCalculate.textContent = "Calculate PageRank";
    }
  }

  // =========================================================================
  // Matrix tabs
  // =========================================================================
  function setupMatrixTabs() {
    const tabs = document.querySelectorAll("#matrix-tabs .tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => {
          t.classList.remove("is-active");
          t.setAttribute("aria-selected", "false");
        });
        tab.classList.add("is-active");
        tab.setAttribute("aria-selected", "true");
        state.activeMatrixTab = tab.dataset.matrix;
        matrixLede.textContent =
          state.activeMatrixTab === "adjacency"
            ? "A 1 marks that the row page links directly to the column page."
            : "Each row represents a webpage. Probability is distributed among the pages it links to.";
        renderActiveMatrix();
      });
    });
  }

  // =========================================================================
  // Init
  // =========================================================================
  function init() {
    btnAddPage.addEventListener("click", addPage);
    btnLinkMode.addEventListener("click", toggleLinkMode);
    btnExample.addEventListener("click", loadExample);
    btnClear.addEventListener("click", clearAll);
    btnCalculate.addEventListener("click", calculate);
    setupMatrixTabs();

    dataSourceNote.textContent = PR.Api.CONFIG.USE_MOCK_DATA
      ? "Currently running on mock data."
      : "Connected to " + PR.Api.CONFIG.API_BASE_URL + ".";

    renderGraph();
    renderEdgeChips();
  }

  init();
})();
