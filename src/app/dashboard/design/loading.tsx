export default function DesignLoading() {
  return (
    <div className='flex h-[calc(100svh-4rem)] min-w-0 flex-1 animate-pulse flex-col md:h-[calc(100svh-3.5rem)]'>
      <div className='bg-muted h-12 shrink-0 border-b' />
      <div className='flex min-h-0 flex-1'>
        <div className='bg-muted/40 flex-1' />
        <div className='bg-muted hidden w-64 shrink-0 border-l lg:block' />
      </div>
    </div>
  );
}
