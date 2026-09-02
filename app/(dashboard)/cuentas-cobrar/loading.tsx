import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default function Loading() {
  return <PageSkeleton kpis={3} rows={8} columns={7} filters />
}
