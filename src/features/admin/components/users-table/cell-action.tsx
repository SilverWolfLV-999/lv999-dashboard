'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Icons } from '@/components/icons';
import type { AdminUser } from '../../api/types';
import { AdjustCreditsDialog } from '../adjust-credits-dialog';
import { DeleteUserDialog } from '../delete-user-dialog';

interface CellActionProps {
  data: AdminUser;
}

/** 行操作：调整 Credits（加 / 设 + 备注）+ 删除用户（二次确认级联清理） */
export function CellAction({ data }: CellActionProps) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <AdjustCreditsDialog user={data} open={adjustOpen} onOpenChange={setAdjustOpen} />
      <DeleteUserDialog user={data} open={deleteOpen} onOpenChange={setDeleteOpen} />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger render={<Button variant='ghost' className='h-8 w-8 p-0' />}>
          <span className='sr-only'>打开菜单</span>
          <Icons.ellipsis className='h-4 w-4' />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuGroup>
            <DropdownMenuLabel>操作</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setAdjustOpen(true)}>
              <Icons.billing className='mr-2 h-4 w-4' /> 调整 Credits
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteOpen(true)}>
              <Icons.trash className='mr-2 h-4 w-4' /> 删除用户
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
