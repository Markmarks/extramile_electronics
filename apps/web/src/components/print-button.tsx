'use client';

import { Button } from '@extramile/ui';

export function PrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className="print:hidden"
    >
      Print
    </Button>
  );
}
