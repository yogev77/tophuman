export function Spinner({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  }

  return (
    <div
      className={`animate-spin ${sizeClasses[size]} border-yellow-500 border-t-transparent rounded-full inline-block`}
    />
  )
}
