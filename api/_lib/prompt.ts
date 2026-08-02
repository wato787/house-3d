export const planPrompt = `
この住宅の間取り画像を解析し、3Dプレビュー用のJSONだけを返してください。
説明文、Markdown、コードフェンスは不要です。

座標は画像左上を原点とし、xは右方向、yは下方向のピクセル座標にしてください。
すべての座標とsizeは画像上のピクセル単位にしてください。mmや実寸値は使わないでください。
scaleは「1メートルあたりのピクセル数」です。
画像上の建物幅が1300pxで実寸13m程度なら scale は100です。
判断できない場合は、建物全体の横幅が約13mになる値を推定してください。

必須のJSON形式:
{
  "scale": 100,
  "spaces": [
    {
      "id": "ldk",
      "name": "LDK",
      "polygon": [[0, 0], [1000, 0], [1000, 1000], [0, 1000]],
      "color": "#f3dfae"
    }
  ],
  "outdoorAreas": [
    {
      "id": "south_garden",
      "kind": "garden",
      "polygon": [[0, 1050], [700, 1050], [700, 1300], [0, 1300]]
    }
  ],
  "openings": [
    {
      "id": "window_ldk_south",
      "kind": "window",
      "position": [500, 1000],
      "width": 180
    }
  ],
  "fixtures": [
    {
      "id": "kitchen",
      "kind": "kitchen",
      "position": [500, 500],
      "size": [240, 65],
      "rotation": 0,
      "color": "#7d858a"
    },
    {
      "id": "stairs",
      "kind": "stairs",
      "position": [850, 780],
      "size": [120, 260],
      "rotation": 0,
      "color": "#d7c3a0"
    },
    {
      "id": "sofa",
      "kind": "sofa",
      "position": [430, 820],
      "size": [170, 85],
      "rotation": 0,
      "color": "#c9c2b8"
    },
    {
      "id": "dining_table",
      "kind": "dining_table",
      "position": [300, 420],
      "size": [170, 95],
      "rotation": 0,
      "color": "#9f6b48"
    },
    {
      "id": "tv_stand",
      "kind": "tv",
      "position": [650, 820],
      "size": [150, 45],
      "rotation": 90,
      "color": "#5f4a3c"
    }
  ]
}

抽出対象:
- spaces: LDK、玄関、洗面、浴室、トイレ、収納、階段などの床領域。3Dの壁はこのpolygonの外周から生成します。
- outdoorAreas: 建物に接する庭、駐車場、テラス、玄関アプローチ。kindは garden | parking | terrace | path。
- openings: ドア、引き戸、窓。positionは該当する壁または部屋境界上の中心座標、widthは画像ピクセル単位。
- fixtures: キッチン、浴室、トイレ、洗面台、階段、ソファ、ダイニングテーブル、テレビ台・テレビ。車は含めないでください。
- 道路、車、寸法線、方眼グリッド、敷地境界線は含めないでください

重要:
- wallsは返さないでください。
- 各spaceのpolygonは壁芯ではなく、部屋の床として見える範囲を囲む閉じた輪郭にしてください。
- spaces同士の面積が重ならないようにしてください。隣接する部屋は辺を共有するだけにしてください。
- LDKのpolygonを広く取りすぎて、パントリー、洗面、玄関、階段などを含めないでください。
- 庭や駐車場はspacesではなくoutdoorAreasに入れてください。
- outdoorAreasは建物内部のspacesと重ならないようにしてください。
- fixturesは部屋の床に載る設備だけにし、床や部屋領域そのものをfixtureとして表現しないでください。
- fixturesはspacesやoutdoorAreasのpolygonと同じ大きさにしないでください。設備本体の小さな矩形だけにしてください。
- 階段室や「階段」「UP」「DN」の表記が見える場合は、必ず fixtures に kind: "stairs" として階段本体の矩形を含めてください。
- 階段の position は階段矩形の中心、size は踏面全体の幅と奥行きにしてください。
- rotation は画像上の階段の長手方向に合わせてください。画像の上下方向に伸びる階段は rotation: 0、左右方向に伸びる階段は rotation: 90 にしてください。
- LDK内にソファ、ダイニングテーブル、テレビ台・テレビの記号が見える場合は、fixtures に kind: "sofa"、"dining_table"、"tv" として含めてください。
- ソファ、ダイニングテーブル、テレビ台は生活感を出すために必要です。ただし椅子を1脚ずつ分けたり、小物を細かく抽出したりしないでください。
- ソファ、ダイニングテーブル、テレビ台・テレビは必ずLDK、リビング、ダイニングのpolygon内に置いてください。洗面、浴室、トイレ、収納、玄関、階段には置かないでください。
- ソファのsizeは横長の座面全体として、1つ目を長辺、2つ目を奥行きにしてください。画像上で通常の横長ソファに見える場合は rotation: 0 にしてください。
- 隣り合う部屋の境界はできるだけ同じ座標を共有してください。
- ドアと窓は可能な限りopeningsに含めてください。
- 1つの部屋を過度に複雑な多角形にせず、主要な角だけで表現してください。

不確実でも、3D下書きとして使える程度に推定してください。
`.trim()
