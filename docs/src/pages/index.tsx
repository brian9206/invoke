import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={styles.heroBanner}>
      <div className={styles.heroBackground}>
        <div className={styles.gradientOrb1}></div>
        <div className={styles.gradientOrb2}></div>
        <div className={styles.gridPattern}></div>
      </div>
      
      <div className="container">
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span className={styles.badgeIcon}>⚡</span>
            <span>Self-hosted Serverless Functions</span>
          </div>
          
          <Heading as="h1" className={styles.heroTitle}>
            Build Powerful Serverless
            <br />
            <span className={styles.gradientText}>Functions with Ease</span>
          </Heading>
          
          <p className={styles.heroSubtitle}>
            Deploy Node.js functions in a secure, isolated VM environment. 
            No servers to manage, just focus on your code with 24+ built-in modules.
          </p>
          
          <div className={styles.heroButtons}>
            <Link
              className={clsx('button button--primary button--lg', styles.primaryButton)}
              to="/docs/getting-started/quick-start">
              Get Started
              <span className={styles.buttonArrow}>→</span>
            </Link>
            <Link
              className={clsx('button button--outline button--lg', styles.secondaryButton)}
              to="/docs/examples/hello-world">
              View Examples
            </Link>
          </div>
          
          <div className={styles.heroStats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>24+</div>
              <div className={styles.statLabel}>Built-in Modules</div>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.stat}>
              <div className={styles.statValue}>Secure</div>
              <div className={styles.statLabel}>VM Isolation</div>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.stat}>
              <div className={styles.statValue}>Express.js</div>
              <div className={styles.statLabel}>Compatible API</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function CodeExample() {
  return (
    <section className={styles.codeSection}>
      <div className="container">
        <div className={styles.codeContainer}>
          <div className={styles.codeHeader}>
            <span className={styles.codeTitle}>Quick Example</span>
            <span className={styles.codeLang}>JavaScript</span>
          </div>
          <pre className={styles.codeBlock}>
            <code>{`module.exports = function(req, res) {
  const { name = 'World' } = req.query;
  
  res.json({
    message: \`Hello, \${name}!\`,
    timestamp: Date.now()
  });
}`}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title="Home"
      description="Build powerful serverless functions with Node.js in a secure VM environment. Deploy with confidence using Express.js-compatible APIs and 24+ built-in modules.">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <CodeExample />
      </main>
    </Layout>
  );
}
