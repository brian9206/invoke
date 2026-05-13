import type { ReactNode } from 'react'
import { useState } from 'react'
import { Highlight, themes } from 'prism-react-renderer'
import 'prismjs/components/prism-csharp'
import clsx from 'clsx'
import Link from '@docusaurus/Link'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import Layout from '@theme/Layout'
import HomepageFeatures from '@site/src/components/HomepageFeatures'
import Heading from '@theme/Heading'

import styles from './index.module.css'

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext()
  return (
    <header className={styles.heroBanner}>
      <div className={styles.heroBackground}>
        <div className={styles.gradientOrb1}></div>
        <div className={styles.gradientOrb2}></div>
        <div className={styles.gridPattern}></div>
      </div>

      <div className='container'>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span className={styles.badgeIcon}>⚡</span>
            <span>Self-hosted Serverless Functions</span>
          </div>

          <Heading as='h1' className={styles.heroTitle}>
            Build Powerful Serverless
            <br />
            <span className={styles.gradientText}>Functions with Ease</span>
          </Heading>

          <p className={styles.heroSubtitle}>
            Write functions in <strong>JavaScript</strong>, <strong>TypeScript</strong>, or <strong>C#</strong> and
            deploy them in a secure sandbox. No servers to manage—just focus on your code.
          </p>

          <div className={styles.langPills}>
            <span className={styles.langPillJs}>JavaScript</span>
            <span className={styles.langPillTs}>TypeScript</span>
            <span className={styles.langPillCs}>C#</span>
          </div>

          <div className={styles.heroButtons}>
            <Link
              className={clsx('button button--primary button--lg', styles.primaryButton)}
              to='/docs/getting-started/quick-start'
            >
              Get Started
              <span className={styles.buttonArrow}>→</span>
            </Link>
            <Link
              className={clsx('button button--outline button--lg', styles.secondaryButton)}
              to='/docs/examples/hello-world'
            >
              View Examples
            </Link>
          </div>

          <div className={styles.heroStats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>Realtime</div>
              <div className={styles.statLabel}>Socket.IO Support</div>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.stat}>
              <div className={styles.statValue}>Secure</div>
              <div className={styles.statLabel}>Sandbox Isolation</div>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.stat}>
              <div className={styles.statValue}>3 Languages</div>
              <div className={styles.statLabel}>JS · TS · C#</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

type Lang = 'js' | 'ts' | 'csharp'

const CODE_TABS: { id: Lang; label: string; color: string }[] = [
  { id: 'js', label: 'JavaScript', color: '#fbbf24' },
  { id: 'ts', label: 'TypeScript', color: '#60a5fa' },
  { id: 'csharp', label: 'C#', color: '#a78bfa' }
]

const PRISM_LANG: Record<Lang, string> = {
  js: 'javascript',
  ts: 'typescript',
  csharp: 'csharp'
}

const CODE_EXAMPLES: Record<Lang, string> = {
  js: `export default function handler(req, res) {
  const { name = 'World' } = req.query;

  res.json({
    message: \`Hello, \${name}!\`,
    timestamp: Date.now()
  });
}`,
  ts: `export default function handler(req: InvokeRequest, res: InvokeResponse) {
  const { name = 'World' } = req.query as { name?: string };

  res.json({
    message: \`Hello, \${name}!\`,
    timestamp: Date.now()
  });
}`,
  csharp: `using Invoke;
using System.Text.Json.Nodes;

[EntryPoint]
public static Task EntryPoint(InvokeRequest req, InvokeResponse res)
{
    var name = req.Query["name"] ?? "World";
    res.Json(new JsonObject({
        ["message"] = $"Hello, {name}!",
        ["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
    }));
    return Task.CompletedTask;
}`
}

function CodeExample() {
  const [active, setActive] = useState<Lang>('js')
  return (
    <section className={styles.codeSection}>
      <div className='container'>
        <div className={styles.codeSectionInner}>
          <h2 className={styles.codeSectionTitle}>One platform, multiple languages</h2>
          <p className={styles.codeSectionSubtitle}>
            Write serverless functions in JavaScript, TypeScript, or C#—same powerful features in every language.
          </p>
          <div className={styles.codeContainer}>
            <div className={styles.codeHeader}>
              <div className={styles.codeTabs}>
                {CODE_TABS.map(tab => (
                  <button
                    key={tab.id}
                    className={clsx(styles.codeTab, active === tab.id && styles.codeTabActive)}
                    style={active === tab.id ? { color: tab.color, borderBottomColor: tab.color } : undefined}
                    onClick={() => setActive(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <Highlight theme={themes.nightOwl} code={CODE_EXAMPLES[active]} language={PRISM_LANG[active]}>
              {({ className, style, tokens, getLineProps, getTokenProps }) => (
                <pre
                  className={clsx(className, styles.codeBlock)}
                  style={{ ...style, background: 'transparent', margin: 0 }}
                >
                  {tokens.map((line, i) => (
                    <div key={i} {...getLineProps({ line })}>
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </div>
                  ))}
                </pre>
              )}
            </Highlight>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext()
  return (
    <Layout
      title='Home'
      description='Build powerful serverless functions with Node.js in a secure sandbox environment. Deploy with confidence using Express.js-compatible APIs and realtime Socket.IO support.'
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <CodeExample />
      </main>
    </Layout>
  )
}
