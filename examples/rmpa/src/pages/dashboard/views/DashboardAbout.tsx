import type {ReactElement} from 'react';
import {Link} from 'react-router-dom';

export default function DashboardAbout(): ReactElement {
  return (
    <section className="dashboard-about">
      <h2>About this page</h2>
      <p>Sub-route inside the "dashboard" MPA entry. Each MPA page owns its own router.</p>
      <nav style={{marginTop: 16}}>
        <Link to="/">Back to Landing</Link>
      </nav>
    </section>
  );
}
