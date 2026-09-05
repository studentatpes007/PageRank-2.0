/**
 * components/ranking.js
 * -----------------------------------------------------------------------
 * Renders two things handed to it entirely by the API response:
 *   1. the calculation panel — damping factor, formula, eigenvector story,
 *      and the raw PageRank vector
 *   2. the final ranking list
 * No PageRank math happens here, with one exception: a small verification
 * step (see verifyEigenRelation) that multiplies the already-returned
 * transition matrix by the already-returned PageRank vector, purely to
 * *display* that the vector satisfies the eigenvector equation. It does
 * not derive the ranking — it just checks the numbers already given.
 * -----------------------------------------------------------------------
 */
(function (global) {
  "use strict";

  function fmt(n, decimals) {
    return Number(n).toFixed(decimals !== undefined ? decimals : 3);
  }

  /** One more application of the Google-matrix update, used only to show G·PR ≈ PR. */
  function verifyEigenRelation(transitionMatrix, dampingFactor, vector) {
    const n = vector.length;
    const next = new Array(n).fill((1 - dampingFactor) / n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        next[j] += dampingFactor * vector[i] * transitionMatrix[i][j];
      }
    }
    return next;
  }

  function renderCalculation(container, result) {
    if (!result || !result.pageRankVector) {
      container.innerHTML = '<p class="placeholder">Create a graph and calculate PageRank to see the mathematics.</p>';
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "panel-body-fade";

    // --- damping factor ---
    const dampingRow = document.createElement("div");
    dampingRow.className = "stat-row";
    dampingRow.innerHTML =
      '<span class="stat-label">Damping factor</span><span class="stat-value">d = ' + fmt(result.dampingFactor, 2) + "</span>";
    wrap.appendChild(dampingRow);

    const dampingNote = document.createElement("p");
    dampingNote.className = "note";
    dampingNote.textContent =
      "Models the probability that a browsing user follows a link rather than jumping to an unrelated page.";
    wrap.appendChild(dampingNote);

    const formula = document.createElement("p");
    formula.className = "formula-block";
    formula.textContent = "PR(p) = (1 − d)/N + d · Σ PR(q)/L(q), summed over pages q linking to p";
    wrap.appendChild(formula);

    // --- eigenvector section ---
    const eigenTitle = document.createElement("h3");
    eigenTitle.className = "subsection-title";
    eigenTitle.textContent = "Why eigenvectors?";
    wrap.appendChild(eigenTitle);

    const eigenIntro = document.createElement("p");
    eigenIntro.className = "note";
    eigenIntro.textContent =
      "The PageRank vector is the stationary distribution of the Google matrix G — the transition matrix adjusted by the damping factor. In eigenvalue terms, it is the eigenvector of G associated with eigenvalue 1.";
    wrap.appendChild(eigenIntro);

    const eigenEquation = document.createElement("p");
    eigenEquation.className = "eigen-line";
    eigenEquation.textContent = "G · PR = PR";
    wrap.appendChild(eigenEquation);

    const eigenInfo = result.eigenInfo;
    const backendComputedEigenvalue = eigenInfo && typeof eigenInfo.eigenvalue === "number";

    if (backendComputedEigenvalue) {
      const line = document.createElement("div");
      line.className = "stat-row";
      line.innerHTML =
        '<span class="stat-label">Dominant eigenvalue (computed)</span><span class="stat-value">λ ≈ ' +
        fmt(eigenInfo.eigenvalue, 3) +
        "</span>";
      wrap.appendChild(line);
    } else {
      const theoryNote = document.createElement("p");
      theoryNote.className = "note";
      theoryNote.innerHTML =
        "This result comes from power iteration rather than an explicit eigendecomposition. " +
        "By the Perron–Frobenius theorem, any column-stochastic matrix like <em>G</em> has dominant eigenvalue exactly " +
        "<strong>λ = 1</strong> — the check below confirms the returned vector actually satisfies G · PR = PR.";
      wrap.appendChild(theoryNote);

      if (result.transitionMatrix) {
        const verified = verifyEigenRelation(result.transitionMatrix, result.dampingFactor, result.pageRankVector);
        const table = document.createElement("table");
        table.className = "convergence-table";
        table.innerHTML =
          "<thead><tr><th>Page</th><th>PR</th><th>G · PR</th></tr></thead>";
        const tbody = document.createElement("tbody");
        result.nodes.forEach((id, i) => {
          const tr = document.createElement("tr");
          tr.innerHTML =
            "<td>" + id + "</td><td>" + fmt(result.pageRankVector[i]) + "</td><td>" + fmt(verified[i]) + "</td>";
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
      }
    }

    // --- pagerank vector ---
    const vectorTitle = document.createElement("h3");
    vectorTitle.className = "subsection-title";
    vectorTitle.textContent = "PageRank vector";
    wrap.appendChild(vectorTitle);

    const vectorLabel = document.createElement("span");
    vectorLabel.className = "vector-label";
    vectorLabel.textContent = result.nodes.join("        ");
    wrap.appendChild(vectorLabel);

    const vectorLine = document.createElement("p");
    vectorLine.className = "vector-line";
    vectorLine.textContent = "PR = [ " + result.pageRankVector.map((v) => fmt(v)).join("   ") + " ]";
    wrap.appendChild(vectorLine);

    container.innerHTML = "";
    container.appendChild(wrap);
  }

  /**
   * renderRanking(container, result, opts)
   * opts: { highlightId, onRowHover(id|null), onRowClick(id) }
   */
  function renderRanking(container, result, opts) {
    opts = opts || {};

    if (!result || !result.ranking || result.ranking.length === 0) {
      container.innerHTML = '<p class="placeholder">Create a graph and calculate PageRank to see the mathematics.</p>';
      return;
    }

    const maxScore = Math.max(...result.ranking.map((r) => r.score), 1e-9);

    const list = document.createElement("ol");
    list.className = "ranking-list panel-body-fade";

    result.ranking.forEach((entry, i) => {
      const li = document.createElement("li");
      const isTop = i === 0;
      li.className = "ranking-row" + (isTop ? " is-top" : "") + (entry.node === opts.highlightId ? " is-highlighted" : "");
      li.dataset.id = entry.node;

      const rank = document.createElement("span");
      rank.className = "ranking-rank";
      rank.textContent = String(i + 1).padStart(2, "0");

      const label = document.createElement("span");
      label.className = "ranking-label";
      label.textContent = entry.node;

      const barTrack = document.createElement("span");
      barTrack.className = "ranking-bar-track";
      const barFill = document.createElement("span");
      barFill.className = "ranking-bar-fill";
      barFill.style.width = Math.max(4, (entry.score / maxScore) * 100) + "%";
      barTrack.appendChild(barFill);

      const score = document.createElement("span");
      score.className = "ranking-score";
      score.textContent = fmt(entry.score);

      li.appendChild(rank);
      li.appendChild(label);
      li.appendChild(barTrack);
      li.appendChild(score);

      li.addEventListener("mouseenter", () => opts.onRowHover && opts.onRowHover(entry.node));
      li.addEventListener("mouseleave", () => opts.onRowHover && opts.onRowHover(null));
      li.addEventListener("click", () => opts.onRowClick && opts.onRowClick(entry.node));

      list.appendChild(li);
    });

    container.innerHTML = "";
    container.appendChild(list);
  }

  global.PR = global.PR || {};
  global.PR.Ranking = { renderCalculation, renderRanking };
})(window);
