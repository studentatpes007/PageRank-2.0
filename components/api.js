/**
 * components/api.js
 * -----------------------------------------------------------------------
 * The ONLY file that should talk to the network. Everything else in the
 * app calls PR.Api.calculatePageRank(graphData) and works with the
 * normalized shape it returns — nothing else knows or cares whether the
 * numbers came from the real Python service or the mock fallback.
 *
 * Frontend  ->  PR.Api.calculatePageRank()  ->  Python /api/pagerank
 *
 * All actual PageRank mathematics belongs in Python. The power-iteration
 * code in this file is a DEV-ONLY MOCK, clearly marked below, that exists
 * so the UI is demonstrable before a backend is wired up. It is not a
 * second "real" implementation of the algorithm.
 * -----------------------------------------------------------------------
 */
(function (global) {
  "use strict";

  const CONFIG = {
    // Base URL of the Python service. Change this once the backend exists.
    API_BASE_URL: "http://localhost:5000",
    ENDPOINT: "/api/pagerank",

    // Flip to false to actually call the Python backend above.
    // Left `true` here because no backend is attached in this project yet.
    USE_MOCK_DATA: true,

    // Mock-only: artificial delay so the loading state is visible, and the
    // damping factor used by the mock's power iteration.
    MOCK_DELAY_MS: 650,
    DEFAULT_DAMPING: 0.85,
  };

  /**
   * calculatePageRank(graphData)
   * graphData: { nodes: string[], edges: {from: string, to: string}[] }
   * Returns: Promise<NormalizedResult>  (see normalizeApiResponse below)
   *
   * >>> THIS is the function a backend integrator replaces / points at
   * >>> the real Python endpoint. Its signature and return shape are the
   * >>> contract the rest of the frontend is built against.
   */
  async function calculatePageRank(graphData) {
    if (CONFIG.USE_MOCK_DATA) {
      const raw = await mockPageRankService(graphData);
      return normalizeApiResponse(raw);
    }

    const response = await fetch(CONFIG.API_BASE_URL + CONFIG.ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(graphData),
    });

    if (!response.ok) {
      throw new Error("PageRank service responded with status " + response.status);
    }

    const raw = await response.json();
    return normalizeApiResponse(raw);
  }

  /**
   * normalizeApiResponse(raw)
   * -----------------------------------------------------------------------
   * Adapter layer: translates whatever shape Python actually returns into
   * the flat shape the UI components expect. If the backend's field names
   * or structure change, this is the only function that needs to change.
   */
  function normalizeApiResponse(raw) {
    return {
      nodes: raw.nodes || [],
      adjacencyMatrix: raw.adjacency_matrix || null,
      transitionMatrix: raw.transition_matrix || null,
      dampingFactor: typeof raw.damping_factor === "number" ? raw.damping_factor : CONFIG.DEFAULT_DAMPING,
      pageRankVector: raw.pagerank_vector || null,
      ranking: raw.ranking || [],
      // Optional: only present if the backend actually computed it.
      eigenInfo: raw.eigen_info || null,
    };
  }

  /* =========================================================================
   * MOCK PAGERANK SERVICE — development fallback only.
   * Stands in for the Python backend described in the project README.
   * Uses the standard power-iteration formulation of PageRank with the
   * conventional dangling-node fix (a page with no outgoing links leaks
   * its rank uniformly to every page). Delete or disable this once a real
   * backend is connected by setting CONFIG.USE_MOCK_DATA = false.
   * ========================================================================= */
  function mockPageRankService(graphData) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(computeMockPageRank(graphData));
      }, CONFIG.MOCK_DELAY_MS);
    });
  }

  function computeMockPageRank(graphData) {
    const nodes = graphData.nodes.slice();
    const edges = graphData.edges || [];
    const n = nodes.length;
    const index = new Map(nodes.map((id, i) => [id, i]));

    // Adjacency matrix: 1 if a link exists from row -> column.
    const adjacency = Array.from({ length: n }, () => new Array(n).fill(0));
    edges.forEach((e) => {
      const i = index.get(e.from);
      const j = index.get(e.to);
      if (i !== undefined && j !== undefined) adjacency[i][j] = 1;
    });

    // Transition matrix: probability of following a link out of each page.
    // Dangling pages (no outgoing links) distribute uniformly across all pages.
    const outDegree = adjacency.map((row) => row.reduce((a, b) => a + b, 0));
    const transition = adjacency.map((row, i) => {
      if (outDegree[i] === 0) return new Array(n).fill(n > 0 ? 1 / n : 0);
      return row.map((v) => v / outDegree[i]);
    });

    const d = CONFIG.DEFAULT_DAMPING;

    // Power iteration: PR = d * M^T * PR + (1 - d) / N, starting uniform.
    let pr = new Array(n).fill(n > 0 ? 1 / n : 0);
    const history = [];
    const maxIterations = 100;
    const tolerance = 1e-8;

    for (let iter = 0; iter < maxIterations; iter++) {
      const next = new Array(n).fill((1 - d) / n);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          // transition[i][j] is the share of page i's rank sent to page j
          next[j] += d * pr[i] * transition[i][j];
        }
      }
      const delta = next.reduce((sum, v, i) => sum + Math.abs(v - pr[i]), 0);
      pr = next;
      if (iter < 6 || iter === maxIterations - 1) {
        history.push({ iteration: iter + 1, vector: pr.slice() });
      }
      if (delta < tolerance) break;
    }

    const ranking = nodes
      .map((id, i) => ({ node: id, score: pr[i] }))
      .sort((a, b) => b.score - a.score);

    return {
      nodes,
      adjacency_matrix: adjacency,
      transition_matrix: transition,
      damping_factor: d,
      pagerank_vector: pr,
      ranking,
      eigen_info: {
        // This is a true structural fact about column-stochastic matrices
        // (Perron-Frobenius), not a fabricated eigen-decomposition result —
        // the mock never claims to have run an eigensolver.
        method: "power_iteration",
        theoretical_eigenvalue: 1.0,
        convergence_history: history,
      },
    };
  }

  global.PR = global.PR || {};
  global.PR.Api = { CONFIG, calculatePageRank, normalizeApiResponse };
})(window);
