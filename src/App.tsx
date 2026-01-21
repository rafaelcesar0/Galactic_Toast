import "./index.css";
import { GalacticToast } from "./GalacticToast";

export function App() {
  return (
    <div className="app">
      <main className="main-layout">
        <section className="game-card">
          <GalacticToast />
        </section>
        <aside className="side-panel">
          <header className="game-info">
            <h1>Galactic Toast</h1>
            <p className="lead">
              Uma torradeira rebelde desvia de asteroides e torra o que
              aparece.
            </p>
          </header>
          <div className="panel-block">
            <h2>Como jogar</h2>
            <p className="compact">
              Setas/WASD: mover | Espaco: atirar | Enter: reinicia | Esc:
              encerra | Touch: direcional + Torrar
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
