import React, { useEffect, useState } from 'react'
import zxcvbn from 'zxcvbn'
import { Progress } from '@/components/ui/progress'

interface PasswordStrengthMeterProps {
  password: string
  onScoreChange?: (score: number) => void
}

const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ password, onScoreChange }) => {
  const [result, setResult] = useState<zxcvbn.ZXCVBNResult | null>(null)

  useEffect(() => {
    if (password) {
      const analysis = zxcvbn(password)
      setResult(analysis)
      onScoreChange?.(analysis.score)
    } else {
      setResult(null)
      onScoreChange?.(0)
    }
  }, [password, onScoreChange])

  if (!password || !result) {
    return null
  }

  const scoreLabels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']
  const textColors = ['text-red-400', 'text-orange-400', 'text-yellow-400', 'text-lime-400', 'text-green-400']
  const progressColors = [
    '[&>div]:bg-red-500',
    '[&>div]:bg-orange-500',
    '[&>div]:bg-yellow-500',
    '[&>div]:bg-lime-500',
    '[&>div]:bg-green-500'
  ]

  const score = result.score
  const feedback =
    result.feedback.warning || (result.feedback.suggestions.length > 0 ? result.feedback.suggestions[0] : '')

  return (
    <div className='mt-2 space-y-2'>
      <Progress value={(score / 4) * 100} className={`h-1.5 bg-secondary ${progressColors[score]}`} />
      <div className='text-xs space-y-1'>
        <span className={`font-medium ${textColors[score]}`}>Password Strength: {scoreLabels[score]}</span>
        {feedback && <p className='text-muted-foreground'>{feedback}</p>}
        {score < 3 && <p className='text-red-400'>Password must have a strength score of at least 3 (Strong)</p>}
      </div>
    </div>
  )
}

export default PasswordStrengthMeter
