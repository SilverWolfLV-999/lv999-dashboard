'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { LoadingButton } from '@/components/ui/loading-button';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

export function AlertModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
  title = '您确定吗？',
  description = '此操作无法撤销。',
  confirmLabel = '继续'
}: AlertModalProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <Modal title={title} description={description} isOpen={isOpen} onClose={onClose}>
      <div className='flex w-full items-center justify-end space-x-2 pt-6'>
        <Button variant='outline' onClick={onClose}>
          取消
        </Button>
        <LoadingButton loading={loading} type='button' variant='destructive' onClick={onConfirm}>
          {confirmLabel}
        </LoadingButton>
      </div>
    </Modal>
  );
}
