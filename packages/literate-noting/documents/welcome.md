# Literate Noting

这是一个从 Hono API 加载的 Markdown 文档，并在前端用 Lexical 做可视化编辑。

行内 ABC notation 会从花括号里渲染出来：{C D E F | G A B c}

```abc note
X:1
T:Block tune
M:4/4
L:1/8
K:C
CDEF GABc | cBAG FEDC |
```

可以在工具栏插入行内或行间音符，编辑 notation，播放，然后保存回 Markdown 文档。
