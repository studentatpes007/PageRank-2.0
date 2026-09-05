/**
 * components/matrix.js
 * -----------------------------------------------------------------------
 * Renders a matrix (adjacency or transition) returned by the PageRank
 * service as an HTML table. Never computes matrix values itself — it only
 * formats numbers it is handed.
 * -----------------------------------------------------------------------
 */
(function (global) {
  "use strict";

  /**
   * renderMatrix(container, labels, matrix, opts)
   * labels: string[]            node ids, in row/column order
   * matrix: number[][]          square matrix aligned to `labels`
   * opts: {
   *   highlightId: string|null,
   *   onCellHover(id|null),
   *   decimals: number
   * }
   */
  function renderMatrix(container, labels, matrix, opts) {
    opts = opts || {};
    const decimals = opts.decimals !== undefined ? opts.decimals : 2;

    if (!matrix || labels.length === 0) {
      container.innerHTML = '<p class="placeholder">Create a graph and calculate PageRank to see the mathematics.</p>';
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "matrix-scroll panel-body-fade";

    const table = document.createElement("table");
    table.className = "matrix";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th"));
    labels.forEach((label, colIndex) => {
      const th = document.createElement("th");
      th.textContent = label;
      th.dataset.col = String(colIndex);
      if (label === opts.highlightId) th.classList.add("is-col-active");
      th.addEventListener("mouseenter", () => opts.onCellHover && opts.onCellHover(label));
      th.addEventListener("mouseleave", () => opts.onCellHover && opts.onCellHover(null));
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    matrix.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      const rowLabel = labels[rowIndex];
      if (rowLabel === opts.highlightId) tr.classList.add("is-row-active");

      const th = document.createElement("th");
      th.textContent = rowLabel;
      th.addEventListener("mouseenter", () => opts.onCellHover && opts.onCellHover(rowLabel));
      th.addEventListener("mouseleave", () => opts.onCellHover && opts.onCellHover(null));
      tr.appendChild(th);

      row.forEach((value, colIndex) => {
        const td = document.createElement("td");
        const isZero = Math.abs(value) < 1e-9;
        td.textContent = isZero ? "0" : value.toFixed(decimals);
        if (isZero) td.classList.add("is-zero");
        if (labels[colIndex] === opts.highlightId) td.classList.add("is-col-active");
        td.addEventListener("mouseenter", () => opts.onCellHover && opts.onCellHover(rowLabel));
        td.addEventListener("mouseleave", () => opts.onCellHover && opts.onCellHover(null));
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    wrapper.appendChild(table);
    container.innerHTML = "";
    container.appendChild(wrapper);
  }

  global.PR = global.PR || {};
  global.PR.Matrix = { renderMatrix };
})(window);
