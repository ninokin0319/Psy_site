// カード本文を検索対象にすることで、課題追加時の二重管理を避ける。
const cards = [...document.querySelectorAll('.experiment-card')];
const grid = document.querySelector('.experiment-grid');
if (grid && cards.length) {
  const tools = document.createElement('div');
  tools.className = 'catalog-tools';
  tools.innerHTML = `<div class="catalog-filters" role="group" aria-label="実験の分野"></div>
    <label class="catalog-search">実験を検索<input type="search" placeholder="実験名・キーワード" aria-controls="experiment-cards"></label>`;
  grid.id = 'experiment-cards';
  grid.before(tools);
  const status = document.createElement('p');
  status.className = 'catalog-status';
  status.setAttribute('role', 'status');
  grid.before(status);
  const empty = document.createElement('p');
  empty.className = 'catalog-empty';
  empty.textContent = '該当する実験がありません。検索語を短くするか、「すべて」を選んでください。';
  grid.after(empty);
  const groups = ['すべて', '知覚', '注意', '記憶', '問題解決', '推論・判断'];
  let selected = 'すべて';
  const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[・–−ー\s-]/g, '');
  function update() {
    const query = normalize(tools.querySelector('input').value);
    let count = 0;
    for (const card of cards) {
      const domain = card.querySelector('.domain-label')?.textContent || '';
      const visible = (selected === 'すべて' || domain.includes(selected)) && normalize(card.textContent).includes(query);
      card.hidden = !visible;
      if (visible) count++;
    }
    status.textContent = `${count}件 / 全${cards.length}件を表示`;
    empty.hidden = count !== 0;
  }
  for (const group of groups) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = group;
    button.setAttribute('aria-pressed', String(group === selected));
    button.addEventListener('click', () => {
      selected = group;
      tools.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      update();
    });
    tools.querySelector('.catalog-filters').append(button);
  }
  tools.querySelector('input').addEventListener('input', update);
  update();
}
