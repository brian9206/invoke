import type { ReactNode } from 'react'
import clsx from 'clsx'
import Heading from '@theme/Heading'
import styles from './styles.module.css'

type FeatureItem = {
  title: string
  icon: string
  description: ReactNode
  gradient: string
}

const FeatureList: FeatureItem[] = [
  {
    title: 'Serverless Execution',
    icon: '⚡',
    gradient: 'from-blue-500 to-cyan-500',
    description: (
      <>
        Write functions in Node.js and execute them in a secure sandbox environment. No servers to manage, automatic
        scaling, just focus on your code.
      </>
    )
  },
  {
    title: 'Realtime + KV Storage',
    icon: '📦',
    gradient: 'from-cyan-500 to-teal-500',
    description: (
      <>
        Build realtime apps with Socket.IO namespaces, rooms, and events. Plus a powerful KV store for persistent data
        with TTL support.
      </>
    )
  },
  {
    title: 'Production Ready',
    icon: '🚀',
    gradient: 'from-teal-500 to-blue-500',
    description: (
      <>
        Express.js-compatible API, network security policies, environment variables, comprehensive execution logs, and
        production-grade monitoring.
      </>
    )
  },
  {
    title: 'Secure by Default',
    icon: '🔒',
    gradient: 'from-purple-500 to-blue-500',
    description: (
      <>
        Sandboxed execution with configurable network policies. Control exactly which domains your functions can access
        with whitelist/blacklist rules.
      </>
    )
  },
  {
    title: 'Developer Friendly',
    icon: '💻',
    gradient: 'from-pink-500 to-purple-500',
    description: (
      <>
        Intuitive CLI for local development and deployment. Test functions locally, view logs in real-time, and manage
        everything from the command line.
      </>
    )
  },
  {
    title: 'Built for Scale',
    icon: '📊',
    gradient: 'from-orange-500 to-pink-500',
    description: (
      <>
        Deploy unlimited functions with retention policies. Monitor execution metrics, manage versions, and scale
        effortlessly with sandboxed execution architecture.
      </>
    )
  }
]

function Feature({ title, icon, description, gradient }: FeatureItem) {
  return (
    <div className={clsx('col col--4', styles.feature)}>
      <div className={styles.featureCard}>
        <div className={clsx(styles.featureIcon, styles[gradient])}>
          <span className={styles.iconEmoji}>{icon}</span>
        </div>
        <div className={styles.featureContent}>
          <Heading as='h3' className={styles.featureTitle}>
            {title}
          </Heading>
          <p className={styles.featureDescription}>{description}</p>
        </div>
      </div>
    </div>
  )
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className='container'>
        <div className={styles.featuresHeader}>
          <Heading as='h2' className={styles.featuresTitle}>
            Everything You Need to Build Serverless Functions
          </Heading>
          <p className={styles.featuresSubtitle}>
            A complete platform for deploying and managing Node.js serverless functions with enterprise-grade security
            and monitoring.
          </p>
        </div>
        <div className='row'>
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  )
}
