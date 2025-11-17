function getQueryParam(key) {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

function renderDetail() {
  const type = getQueryParam('type') || 'movies';
  const id = parseInt(getQueryParam('id'), 10);
  const list = type === 'series' ? series : movies;
  const item = list && !isNaN(id) ? list[id] : null;

  const container = document.getElementById('detail-container');
  if (!container) return;

  if (!item) {
    container.innerHTML = '<div class="alert alert-warning">Item not found</div>';
    return;
  }

  container.innerHTML = `
    <div class="row align-items-center g-5">
      <div class="col-lg-5 col-md-6">
        <img src="${item.poster}" class="movie-poster" alt="${item.title}" />
      </div>
      <div class="col-lg-7 col-md-6">
        <h1 class="detail-title">${item.title}</h1>
        <div class="rating-badge"><i class="bi bi-star-fill"></i> ${item.rating}/10</div>
        <p class="description-text">${item.description || 'No description available.'}</p>
        <div class="mt-4 d-flex gap-3">
          <button class="action-btn" id="backBtn">
            <i class="bi bi-chevron-left"></i> Back
          </button>
          <button class="action-btn" disabled style="background: rgba(255, 255, 255, 0.2);">
            <i class="bi bi-play-fill"></i> Watch Now
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', () => {
    history.back();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderDetail);
} else {
  renderDetail();
}