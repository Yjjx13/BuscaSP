function summarizeOffers(offers) {
  const ordered = (offers || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id));
  const supplier = ordered.filter(o => o.sender_role === 'SUPPLIER').pop();
  return {
    latestSupplier: supplier ? { ...supplier, expectedLabel: supplier.expected_available_at ? String(supplier.expected_available_at).slice(0, 10) : '' } : null,
    latestBuyer: ordered.filter(o => o.sender_role === 'BUYER').pop() || null
  };
}
module.exports = { summarizeOffers };
