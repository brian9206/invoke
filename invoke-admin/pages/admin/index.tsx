import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '../../components/Layout'
import ProtectedRoute from '../../components/ProtectedRoute'
import { 
  Activity, 
  Package, 
  Zap, 
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle
} from 'lucide-react'

interface Stats {
  totalFunctions: number
  activeFunctions: number
  totalExecutions: number
  recentErrors: number
  avgResponseTime: number
  successRate: number
}

interface RecentActivity {
  id: string
  functionId: string
  functionName: string
  status: 'success' | 'error'
  executionTime: number
  executedAt: string
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalFunctions: 0,
    activeFunctions: 0,
    totalExecutions: 0,
    recentErrors: 0,
    avgResponseTime: 0,
    successRate: 100
  })
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const [statsResponse, activityResponse] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/dashboard/recent-activity')
      ])

      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setStats(statsData.data)
      }

      if (activityResponse.ok) {
        const activityData = await activityResponse.json()
        setRecentActivity(activityData.data)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      name: 'Total Functions',
      value: stats.totalFunctions,
      icon: Package,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10'
    },
    {
      name: 'Active Functions',
      value: stats.activeFunctions,
      icon: CheckCircle,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10'
    },
    {
      name: 'Total Executions',
      value: stats.totalExecutions,
      icon: Zap,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10'
    },
    {
      name: 'Avg Response Time',
      value: `${stats.avgResponseTime}ms`,
      icon: Clock,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10'
    },
    {
      name: 'Success Rate',
      value: `${stats.successRate}%`,
      icon: TrendingUp,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10'
    },
    {
      name: 'Recent Errors',
      value: stats.recentErrors,
      icon: AlertTriangle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10'
    }
  ]

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout title="Dashboard">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-500"></div>
          </div>
        </Layout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <Layout title="Dashboard">
        <div className="space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {statCards.map((card) => (
              <div key={card.name} className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm font-medium">{card.name}</p>
                    <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
                  </div>
                  <div className={`${card.bgColor} p-3 rounded-xl`}>
                    <card.icon className={`w-6 h-6 ${card.color}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Recent Activity */}
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <Activity className="w-5 h-5 mr-2" />
                Recent Activity
              </h3>
            </div>

            {recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <Link
                    key={activity.id}
                    href={`/admin/functions/${activity.functionId}`}
                    className="block p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                          activity.status === 'success' ? 'bg-green-400' : 'bg-red-400'
                        }`} />
                        <div>
                          <p className="text-white font-medium">{activity.functionName}</p>
                          <p className="text-gray-400 text-sm">
                            Executed {new Date(activity.executedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${
                          activity.status === 'success' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {activity.status === 'success' ? 'Success' : 'Error'}
                        </p>
                        <p className="text-gray-400 text-sm">{activity.executionTime}ms</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No recent activity</p>
              </div>
            )}
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  )
}