/** Build identity the connected service reports alongside `service.version`. Absent on older services. */
export interface CapabilityVersions {
  clio_agent?: string;
  backend_build?: string;
  python?: string;
  gact_contract?: string;
  marketplace: {
    source: string;
    ref?: string;
    pinned_commit?: string;
    installed_commit?: string;
    source_id: string;
  } | null;
}
