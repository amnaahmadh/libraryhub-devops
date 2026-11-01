document.addEventListener('submit', function (event) {
  if (event.target.matches('.confirm-delete') && !window.confirm('Are you sure? This cannot be undone.')) {
    event.preventDefault();
  }
});
