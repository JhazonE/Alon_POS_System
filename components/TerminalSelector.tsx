'use client';
import { authFetch } from '@/lib/api-config';

import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Terminal {
  id: string;
  name: string;
}

interface TerminalSelectorProps {
  terminalId: string;
  onTerminalChange: (value: string) => void;
  showAllOption?: boolean;
}

export function TerminalSelector({ 
  terminalId, 
  onTerminalChange, 
  showAllOption = true 
}: TerminalSelectorProps) {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchTerminals = async () => {
      setIsLoading(true);
      try {
        const response = await authFetch('/api/pos/terminals');
        const result = await response.json();
        if (result.success) {
          setTerminals(result.data);
        }
      } catch (error) {
        console.error('Error fetching terminals:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTerminals();
  }, []);

  return (
    <div className="space-y-2">
       <Select value={terminalId} onValueChange={onTerminalChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select terminal" />
        </SelectTrigger>
        <SelectContent>
            {showAllOption && (
                <SelectItem value="all">All Terminals</SelectItem>
            )}
            {terminals.map((term) => (
                <SelectItem key={term.id} value={String(term.id)}>
                    {term.name}
                </SelectItem>
            ))}
            {/* Fallback/Default if no terminals fetched yet or empty */}
            {(!terminals || terminals.length === 0) && !isLoading && (
               <>
                 <SelectItem value="Counter 1">Counter 1 (Fallback)</SelectItem>
                 <SelectItem value="Counter 2">Counter 2 (Fallback)</SelectItem>
               </>
            )}
        </SelectContent>
      </Select>
    </div>
  );
}
