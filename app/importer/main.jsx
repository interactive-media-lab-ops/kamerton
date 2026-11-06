import React from 'react';
import { createRoot } from 'react-dom/client';
import Importer from './Importer.jsx';
import Precedents from './Precedents.jsx';
import './importer.css';

// Імпортер це інструмент редактора, а не продукт: StrictMode тут корисний,
// бо ловить подвійні ефекти в формі, а ціна зайвого рендера нульова.
/**
 * Дві сторінки інструменту редактора в одній збірці: імпорт тижня і збірка
 * картки прецеденту. Обидві поза продуктом, обидві офлайн.
 * Вибір через хеш, щоб працювало з file:// без роутера.
 */
function Tools() {
  const [page, setPage] = React.useState(
    () => (window.location.hash.includes('precedents') ? 'precedents' : 'import')
  );
  React.useEffect(() => {
    const onHash = () => setPage(window.location.hash.includes('precedents') ? 'precedents' : 'import');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return (
    <>
      <nav className="i-nav">
        <a href="#import" className={page === 'import' ? 'is-on' : undefined}>ІМПОРТ ТИЖНЯ</a>
        <a href="#precedents" className={page === 'precedents' ? 'is-on' : undefined}>ЗБІРКА ПРЕЦЕДЕНТУ</a>
      </nav>
      {page === 'precedents' ? <Precedents /> : <Importer />}
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Tools />
  </React.StrictMode>
);
