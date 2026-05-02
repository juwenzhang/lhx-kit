import type {ReactElement} from 'react';
import {Link} from 'react-router-dom';

export default function HomeAbout(): ReactElement {
  return (
    <section className="home-about">
      <h1>About</h1>
      <p>This sub-route lives inside the same MPA page (`home`) as the landing view.</p>
      <p>Each MPA page owns its own router; other pages (e.g. `settings`) have their own HTML entry.</p>
      <nav style={{marginTop: 16}}>
        <Link to="/">Back to Landing</Link>
      </nav>
    </section>
  );
}
