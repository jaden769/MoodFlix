
function createCard(item, index, type) {
  const col = document.createElement('div');
  col.className = 'col-md-3 mb-4';

  const card = document.createElement('div');
  card.className = 'card h-100 bg-dark text-white border-0';
  // make clickable via anchor so clicking opens a details page in the same tab
  const link = document.createElement('a');
  link.href = `movie.html?type=${type}&id=${index}`;
  link.className = 'text-white text-decoration-none';

  const img = document.createElement('img');
  img.className = 'card-img-top';
  img.src = item.poster;
  img.alt = item.title;
  img.onerror = () => { img.src = 'images/image1.png'; };

  const body = document.createElement('div');
  body.className = 'card-body';

  const h5 = document.createElement('h5');
  h5.className = 'card-title';
  h5.textContent = item.title;

  const p = document.createElement('p');
  p.className = 'card-text';
  p.textContent = `Rating: ${item.rating}`;

  body.appendChild(h5);
  body.appendChild(p);
  card.appendChild(img);
  card.appendChild(body);
  // wrap the card in a link so the entire card is clickable
  link.appendChild(card);
  col.appendChild(link);
  return col;
}

function render() {
  const moviesSection = document.getElementById('movies-section');
  const seriesSection = document.getElementById('series-section');

  if (moviesSection) {
    movies.forEach((m, i) => moviesSection.appendChild(createCard(m, i, 'movies')));
  }

  if (seriesSection) {
    series.forEach((s, i) => seriesSection.appendChild(createCard(s, i, 'series')));
  }
}

// Wait for DOM content to be ready in case the script wasn't deferred
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', render);
} else {
  render();
}