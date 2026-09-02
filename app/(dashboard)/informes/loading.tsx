import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default function Loading() {
  return <PageSkeleton kpis={4} rows={6} columns={5} filters />
}
