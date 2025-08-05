import { HybridMigrationDashboard } from "@/components/HybridMigrationDashboard";

export default function HybridMigrationPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Hybrid Storage Migration</h1>
        <p className="text-gray-600 mt-2">
          Migrate TDDF1 raw line data to object storage to reduce database size and improve performance.
        </p>
      </div>
      
      <HybridMigrationDashboard />
    </div>
  );
}