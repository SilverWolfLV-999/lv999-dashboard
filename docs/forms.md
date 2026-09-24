# 表单

表单遵循 **shadcn 官方 TanStack Form 规范**，并使用 TanStack 自身的
[`createFormHook`](https://tanstack.com/form/latest/docs/framework/react/guides/form-composition)
模式进行扩展：文档中的 `Field` anatomy **每种控件只编写一次**作为可复用的字段组件，
页面中在 `form.AppField` 内以一行代码即可使用。

- [shadcn: TanStack Form](https://ui.shadcn.com/docs/forms/tanstack) —
  每个字段组件内部的 anatomy 结构
- [TanStack Form 文档](https://tanstack.com/form/latest) — 验证器、
  监听器、数组、异步验证

## 架构

| 文件 | 提供内容 |
| --- | --- |
| `src/lib/form-context.ts` | `createFormHookContexts` — `fieldContext`、`formContext`、`useFieldContext`、`useFieldInvalid`、`BaseFieldProps` |
| `src/components/forms/fields/*.tsx` | 16 个字段组件，每个都是对应控件的 shadcn 文档标准 anatomy |
| `src/components/forms/submit-button.tsx` | `SubmitButton` — 提交中自动禁用（`form.Subscribe`） |
| `src/lib/form.ts` | `createFormHook` — 导出 `useAppForm` / `withForm`，已注册所有内容 |

## 使用模式

每个表单使用一个 `useAppForm`，配合 Zod schema 在提交时验证，每个字段使用一个
`form.AppField` 渲染对应的组件：

```tsx
'use client';

import { useAppForm } from '@/lib/form';
import { FieldGroup } from '@/components/ui/field';
import * as z from 'zod';

const formSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters.'),
  severity: z.string().min(1, 'Select a severity.')
});

export function BugReportForm() {
  const form = useAppForm({
    defaultValues: { title: '', severity: '' },
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => console.log(value)
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.AppField
          name='title'
          children={(field) => (
            <field.TextField label='Bug Title' required placeholder='Login button broken' />
          )}
        />
        <form.AppField
          name='severity'
          children={(field) => (
            <field.SelectField
              label='Severity'
              options={[
                { value: 'low', label: 'Low' },
                { value: 'high', label: 'High' }
              ]}
            />
          )}
        />
        <form.AppForm>
          <form.SubmitButton>Submit</form.SubmitButton>
        </form.AppForm>
      </FieldGroup>
    </form>
  );
}
```

`form.AppField` 的 `name` 会根据 `defaultValues` 进行完整的类型检查 —
拼写错误会导致编译报错。字段级的验证器/监听器写在 `form.AppField` 元素上
（异步检查、`onChangeListenTo` 关联字段）。

## 可用的字段组件

所有组件都在 `form.AppField` 内以 `field.XxxField` 的形式渲染；每个组件都接受
`label`、`description?`、`required?` 属性。

| 组件 | 值类型 | 说明 |
| --- | --- | --- |
| `TextField` | `string` / `number` | 支持任意 input `type`（text、email、password、tel、url、time、number）。数字输入在边界处自动转换 — 清空时写入 `undefined`。异步验证器运行时会显示加载指示。 |
| `TextareaField` | `string` | `showCount` 渲染基于 `maxLength` 的字数统计 |
| `SelectField` | `string` | `options` 数组 |
| `CheckboxField` | `boolean` | 单个复选框（条款、同意） |
| `SwitchField` | `boolean` | 标签/描述在左，开关在右 |
| `RadioGroupField` | `string` | `FieldSet` + `FieldLegend` 语义 |
| `SliderField` | `number` | `min`/`max`/`step` + 数值显示 |
| `ComboboxField` | `string` | 可搜索的下拉选择（Popover + Command） |
| `DatePickerField` | `Date \| undefined` | Popover + Calendar，支持 `disabledDates` |
| `DateRangeField` | `DateRange \| undefined` | 双月范围日历 |
| `OtpField` | `string` | 6 位验证码（3 + 3） |
| `ColorField` | `string` | 原生取色器 + hex 输入 |
| `FileUploadField` | `File[]` | 封装 `FileUploader`，支持 `maxSize`/`maxFiles` |
| `CheckboxGroupField` | `string[]` | 需要在 AppField 上设置 `mode='array'` |
| `TagsField` | `string[]` | 需要 `mode='array'`；Enter/Add 添加，点击标签删除 |
| `ToggleGroupField` | `string[]` | 需要 `mode='array'`；将 `ToggleGroupItem` 作为 children 传入 |

## 一次性自定义字段 — 使用 `form.Field` 底层模式

对于组件未覆盖的场景（对象行数组、定制 UI），直接使用底层文档模式 —
它可以与现有组件自由组合：

```tsx
<form.Field
  name='members'
  mode='array'
  children={(field) => (
    <>
      {field.state.value.map((_, i) => (
        <form.Field
          name={`members[${i}].name`}
          children={(subField) => {
            const isInvalid = subField.state.meta.isTouched && !subField.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <Input
                  value={subField.state.value}
                  onChange={(e) => subField.handleChange(e.target.value)}
                  onBlur={subField.handleBlur}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={subField.state.meta.errors} />}
              </Field>
            );
          }}
        />
      ))}
      <Button type='button' onClick={() => field.pushValue({ name: '' })}>Add</Button>
    </>
  )}
/>
```

自定义字段内的文档规范：`<Field>` 上设置 `data-invalid`，
控件上设置 `aria-invalid`，`{isInvalid && <FieldError errors={…} />}`，
函数验证器返回 `{ message: '…' }` 对象。

## 大型表单的拆分 — `withForm` 分区

使用 `withForm`（同样从 `@/lib/form` 导出）将大型表单拆分为可复用的分区组件。
分区通过 props 接收表单实例，并保持 **完全类型安全的字段名** —
分区内拼写错误的 `name` 仍然会导致编译报错：

```tsx
import { useAppForm, withForm } from '@/lib/form';

const ShippingSection = withForm({
  defaultValues: checkoutDefaults, // 将分区绑定到表单结构
  render: function ShippingRender({ form }) {
    return (
      <FieldGroup>
        <form.AppField
          name='shipping.street'
          children={(field) => <field.TextField label='Street' required />}
        />
        <form.AppField
          name='shipping.city'
          children={(field) => <field.TextField label='City' required />}
        />
      </FieldGroup>
    );
  }
});

// 在页面中使用：
const form = useAppForm({ defaultValues: checkoutDefaults, ... });
<ShippingSection form={form} />
```

深层路径（`org.billing.address.city`）、数组子路径（`admins[0].prefs.notify`）、
以及联合类型的叶子节点都保持类型安全，40+ 字段时类型检查依然很快。

## 模板特有说明

**配合 React Query 提交。** `onSubmit` 等待 mutation 完成；成功/错误处理
在 mutation 上定义：

```tsx
onSubmit: async ({ value }) => {
  await createMutation.mutateAsync(value);
};
```

**Sheet / Dialog 表单。** 提交按钮位于 footer 中，在 `<form>` 元素外部，
通过 HTML `form` 属性关联：

```tsx
<form id='sheet-form' onSubmit={…}>…</form>
<SheetFooter>
  <Button type='submit' form='sheet-form'>Save</Button>
</SheetFooter>
```

**数字输入。** `TextField type='number'` 已在边界处自动转换；
必填数字建议使用人性化提示：`z.number({ error: 'Price is required' })`。

**已知注意事项**（经压力测试验证）：

- `field.XxxField` 组件通过 `useFieldContext<T>()` 断言其值类型 —
  编译器会检查 `name` 路径是否存在，但不会检查控件是否匹配路径的值类型
  （在 string 路径上使用 `SwitchField` 会编译通过但渲染错误的值）。
  请对照上方表格匹配合适的控件。
- 在 `form.AppField` 外部渲染字段组件会抛出明确的错误
  （`fieldContext only works when within a fieldComponent…`）—
  不会静默失败。
- 同时挂载两个具有相同字段名的表单（如 Sheet 覆盖在页面上方）会产生
  重复的 `id` 属性 — 这是 shadcn 文档中 `id={field.name}` 的命名规范导致的。
  表单*状态*仍完全隔离；仅 label 目标的 id 会冲突。如果需要两者的标签
  都可点击，请重命名字段或避免同时挂载。
- 在使用 `CheckboxGroupField` / `TagsField` / `ToggleGroupField` 的 AppField 上
  忘记设置 `mode='array'` 仍然可以渲染和更新 — 但请遵循规范：
  array 模式能让 TanStack 正确追踪每个子项的 meta 状态。
