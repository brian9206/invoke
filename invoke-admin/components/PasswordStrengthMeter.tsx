import React, { useEffect, useState } from 'react';
import zxcvbn from 'zxcvbn';

interface PasswordStrengthMeterProps {
  password: string;
  onScoreChange?: (score: number) => void;
}

const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ 
  password, 
  onScoreChange 
}) => {
  const [result, setResult] = useState<zxcvbn.ZXCVBNResult | null>(null);

  useEffect(() => {
    if (password) {
      const analysis = zxcvbn(password);
      setResult(analysis);
      onScoreChange?.(analysis.score);
    } else {
      setResult(null);
      onScoreChange?.(0);
    }
  }, [password, onScoreChange]);

  if (!password || !result) {
    return null;
  }

  const scoreLabels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
  const scoreColors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-lime-500',
    'bg-green-500'
  ];
  const textColors = [
    'text-red-400',
    'text-orange-400',
    'text-yellow-400',
    'text-lime-400',
    'text-green-400'
  ];

  const score = result.score;
  const strengthLabel = scoreLabels[score];
  const strengthColor = scoreColors[score];
  const textColor = textColors[score];

  // Get the first suggestion or warning
  const feedback = result.feedback.warning || 
                   (result.feedback.suggestions.length > 0 
                     ? result.feedback.suggestions[0] 
                     : '');

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className={`h-1 flex-1 rounded-full transition-colors ${
              index <= score ? strengthColor : 'bg-gray-700'
            }`}
          />
        ))}
      </div>

      {/* Strength label and feedback */}
      <div className="text-xs space-y-1">
        <div className={`font-medium ${textColor}`}>
          Password Strength: {strengthLabel}
        </div>
        {feedback && (
          <div className="text-gray-400">
            {feedback}
          </div>
        )}
        {score < 3 && (
          <div className="text-red-400">
            Password must have a strength score of at least 3 (Strong)
          </div>
        )}
      </div>
    </div>
  );
};

export default PasswordStrengthMeter;
