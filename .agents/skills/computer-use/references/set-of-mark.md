# Set-of-Mark Reference

## What is Set-of-Mark?

A technique where numbered visual markers are overlaid on interactive UI elements in a screenshot, enabling a vision LLM to reference elements by ID instead of pixel coordinates.

## Element Selection Criteria

An element gets a mark if:
1. Its `role` is in the interactive set (button, edit, checkbox, menuitem, link, etc.)
2. It has valid `bounds` (x, y, width > 0, height > 0)
3. Tree depth ≤ 10 (prevents infinite recursion)

## Supported Roles

### Invoke-able (click)
`button`, `menuitem`, `hyperlink`, `link`, `splitbutton`

### Value-settable (type)
`edit`, `text`, `combobox`, `spinner`

### Toggle-able
`checkbox`, `radiobutton`

### Select-able
`listitem`, `treeitem`, `tabitem`, `tab`, `pagetab`

### Range (slider)
`slider`

## Badge Rendering

- Red circle (radius 12px) with white number
- Red translucent outline around element bounds
- Badge placed at top-left corner of element
- Font: Arial 14pt (fallback to PIL default)

## LLM Response Format

```json
{"action": "click", "element_id": 7, "reason": "submit the form"}
{"action": "type", "element_id": 3, "text": "hello", "reason": "enter name"}
{"action": "done", "reason": "task complete"}
{"action": "fail", "reason": "element not visible"}
```
