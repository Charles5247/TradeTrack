'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: number;
  changeLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  iconBg?: string;
  loading?: boolean;
  onClick?: () => void;
  variant?: 'default' | 'warning' | 'danger' | 'success';
}

export function StatsCard({
  title,
  value,
  subtitle,
  change,
  changeLabel,
  icon: Icon,
  iconColor = 'text-primary',
  iconBg = 'bg-primary/10',
  loading = false,
  onClick,
  variant = 'default',
}: StatsCardProps) {
  const variantStyles = {
    default: 'border-border',
    warning: 'border-amber-200 dark:border-amber-900',
    danger: 'border-red-200 dark:border-red-900',
    success: 'border-green-200 dark:border-green-900',
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'transition-all hover:shadow-md',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:scale-[1.01]'
      )}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            <p className={cn(
              'text-2xl font-bold mt-1',
              variant === 'danger' && 'text-red-600 dark:text-red-400',
              variant === 'warning' && 'text-amber-600 dark:text-amber-400',
              variant === 'success' && 'text-green-600 dark:text-green-400',
            )}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
            {change !== undefined && (
              <div className="flex items-center gap-1 mt-2">
                {change > 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : change < 0 ? (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                ) : (
                  <Minus className="h-3 w-3 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    'text-xs font-medium',
                    change > 0 ? 'text-green-500' : change < 0 ? 'text-red-500' : 'text-muted-foreground'
                  )}
                >
                  {change > 0 ? '+' : ''}{change}%
                </span>
                {changeLabel && (
                  <span className="text-xs text-muted-foreground">{changeLabel}</span>
                )}
              </div>
            )}
          </div>
          <div className={cn('p-2.5 rounded-xl shrink-0 ml-4', iconBg)}>
            <Icon className={cn('h-5 w-5', iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
