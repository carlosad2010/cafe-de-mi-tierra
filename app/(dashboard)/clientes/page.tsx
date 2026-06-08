import { createClient } from '@/lib/supabase/server'
import { CustomersClient } from './CustomersClient'

export default async function CustomersPage() {
  const supabase = await createClient()
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .order('full_name')

  return <CustomersClient initialCustomers={customers ?? []} />
}
