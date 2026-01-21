import "./index.css";
import { GalacticToast } from "./GalacticToast";

export function App() {
  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Arcade em canvas</p>
          <h1>Galactic Toast</h1>
          <p className="lead">
            Uma torradeira rebelde, um espaco infinito e um estoque limitado de
            torradas. Sobreviva ao enxame de asteroides e desbloqueie mais
            disparos para dominar a galaxia.
          </p>
        </div>
        <div className="hero-cards">
          <div className="hero-card">
            <span>Missao</span>
            <strong>Sobreviver</strong>
          </div>
          <div className="hero-card">
            <span>Motor</span>
            <strong>Bun + React</strong>
          </div>
          <div className="hero-card">
            <span>Formato</span>
            <strong>Browser</strong>
          </div>
        </div>
      </header>

      <main className="main-layout">
        <section className="game-card">
          <GalacticToast />
        </section>
        <aside className="side-panel">
          <div className="panel-block">
            <h2>Controles</h2>
            <p>Setas ou WASD para mover / Espaco para atirar.</p>
            <p>Enter reinicia / Esc encerra.</p>
          </div>
          <div className="panel-block">
            <h2>Arsenal</h2>
            <p>
              Cada 15 mortes confirmadas liberam mais uma torrada, ate o limite
              de seis.
            </p>
          </div>
          <div className="panel-block">
            <h2>Escudo</h2>
            <p>
              A torradeira fica invulneravel por 1 segundo apos um impacto.
            </p>
          </div>
          <div className="panel-block highlight">
            <h2>Dica</h2>
            <p>
              Dispare em sequencia curta e mantenha distancia para controlar o
              ritmo das ondas.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
