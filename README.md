<div align="center">

# DoughLab

**Oyun hamuruyla veri geometrisi**

Tarayıcıda sanal hamurdan 3B şekiller yap, onları veri setine dönüştür ya da gerçek bir veri setini 3B'ye indirip üzerine hamurla model kur.

[![Canlı demo](https://img.shields.io/badge/demo-canl%C4%B1-2f80ed)](https://hbt00002.github.io/doughlab/)
[![Lisans: MIT](https://img.shields.io/badge/lisans-MIT-green)](LICENSE)
![Kurulum gerekmez](https://img.shields.io/badge/kurulum-gerekmez-brightgreen)
![three.js r169](https://img.shields.io/badge/three.js-r169-black)

**Türkçe** · [English](README.en.md)

**[▶ Hemen dene: hbt00002.github.io/doughlab](https://hbt00002.github.io/doughlab/)**

![DoughLab: hamur sahnesi ve canlı analiz paneli](docs/screenshot.png)

</div>

## İçindekiler

- [Neden DoughLab?](#neden-doughlab)
- [Özellikler](#özellikler)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Kullanım](#kullanım)
- [Hamur ve veri karşılıkları](#hamur-ve-veri-karşılıkları)
- [Colab ile kullanım](#colab-ile-kullanım)
- [Nasıl çalışır?](#nasıl-çalışır)
- [Proje yapısı](#proje-yapısı)
- [Yol haritası](#yol-haritası)
- [Katkı](#katkı)
- [Lisans ve teşekkür](#lisans-ve-teşekkür)

## Neden DoughLab?

Çok boyutlu veriyi anlamanın en iyi yollarından biri, onun **şeklini** görmektir. Düz bir yüzey doğrusal bir modele, kıvrımlı bir iz doğrusal olmayan bir ilişkiye, ayrık bir küme ise alt gruplara işaret eder.

DoughLab, bir veri bilimi dersindeki ödevden doğdu: Gapminder verisinin 3B PCA grafiğini evde oyun hamuruyla modellemek. Uygulama bu fikri iki yönlü hale getirir:

- **Hamurdan veriye:** Bir şekil yap; DoughLab şeklin içinden noktalar örnekleyerek gerçek bir veri seti üretsin. Şekli büktükçe, gürültü ekledikçe ya da yeni parçalar koydukça PCA ve korelasyonların nasıl değiştiğini anında gör.
- **Veriden hamura:** Bir CSV yükle; DoughLab onu PCA ile 3B'ye indirip sahneye yarı saydam bir "hayalet" olarak koysun. Modelini hamurla bu hayaletin üzerine kur ve uyum skorunu takip et.

## Özellikler

### Modelleme
- **Üç parça türü:** top, yılan ve levha. Yılan ile levha bükülebilir.
- **Taşı, döndür ve ölçekle** araçları; çoğaltma ve silme.
- Her parça için **renk**, **hamur türü** (klasik, parlak, simli) ve **doku** ayarı.
- Sahneyi **JSON olarak kaydet / aç**; modellerini başkalarıyla paylaş.

### Veri üretimi
- Her parçanın içinden **hacmiyle orantılı** sayıda nokta örneklenir.
- **Doku**, noktalara Gauss gürültüsü ekler.
- Üç görünüm: **hamur**, **hamur + nokta** (yarı saydam), **sadece nokta**.
- Veriyi **CSV olarak indir** ve Colab'da analiz et.

### Canlı analiz
- **PCA:** açıklanan varyans, bileşen yükleri ve şekil yorumu (*çizgisel*, *düzlemsel* veya *hacimsel*).
- **PCA eksenleri** sahnede ok olarak gösterilir.
- Eksen çiftleri için **Pearson, Spearman ve Kendall** korelasyonları, gri tonlu ısı haritası olarak.
- **Grup etkisi (η²):** grup etiketlerinin her eksendeki varyansın ne kadarını açıkladığı.
- Analiz **tüm parçalar** ya da yalnızca **seçili parça** için yapılabilir. Bütün ile alt grubun farklı örüntüler gösterebildiğini (Simpson paradoksu) görmenin kolay bir yolu.

### Hayalet veri modu

![Gapminder verisi hayalet modunda: kıtaya göre renklenmiş noktalar ve değişken okları](docs/ghost-mode.png)

- Kendi CSV'ni yükle ya da tek tıkla **Gapminder** örneğini getir.
- Seçilen sayısal sütunlar PCA ile **3B'ye indirgenir**. Korunan varyans oranı panelde gösterilir.
- **Standartlaştırma** ve çarpık sütunlara **log dönüşümü** açılıp kapatılabilir. Bu tercihlerin sonucu nasıl değiştirdiği anında görülür.
- Noktalar **kategorik bir sütuna göre** renklenir. Her değişken için bir **yük oku** (biplot) çizilir.
- Bir noktanın **üzerine gelince** o satırın değerleri görünür.
- **Hamur uyumu:** *kapsama* ve *taşma* skorları, hamur modelinin veriye ne kadar iyi oturduğunu ölçer.

## Hızlı başlangıç

### Çevrimiçi

Kurulum gerekmez: **[hbt00002.github.io/doughlab](https://hbt00002.github.io/doughlab/)** adresini aç. WebGL 2 destekleyen güncel bir tarayıcı yeterlidir.

### Yerelde

```bash
git clone https://github.com/hbt00002/doughlab.git
cd doughlab
python -m http.server 8000
```

Ardından tarayıcıda `http://localhost:8000` adresine git.

> Uygulama ES modülleri kullandığı için `index.html` dosyasını doğrudan açmak yerine bir yerel sunucu gerekir. Three.js CDN üzerinden yüklendiği için internet bağlantısı da gerekir.

## Kullanım

### Temel iş akışı

1. **Hamur ekle** bölümünden bir parça seç ve sahnede taşı, döndür, ölçekle.
2. **Seçili parça** panelinde boyutları, bükülmeyi, dokuyu, rengi ve grup adını ayarla.
3. **Analiz** panelinde PCA ve korelasyonların değişimini izle.
4. **Görünüm → Nokta** ile hamurun ürettiği veriyi gör, **CSV indir** ile dışa aktar.

### Hayalet ile modelleme

1. **Hayalet veri → Gapminder örneği** butonuna bas ya da kendi CSV'ni yükle.
2. PCA'ya girecek değişkenleri ve renklendirme sütununu seç.
3. Hamur parçalarını hayaletin üzerine yerleştir.
4. **Kapsama** skorunu yükseltip **taşma** skorunu düşürmeye çalış.

### Fare ve klavye

| Eylem | Kontrol |
|---|---|
| Parça seç | Sol tık |
| Kamerayı döndür | Sol tuşla sürükle |
| Kamerayı kaydır | Sağ tuşla sürükle |
| Yakınlaş / uzaklaş | Fare tekerleği |
| Taşı / döndür / ölçekle | `W` / `E` / `R` |
| Seçili parçayı sil | `Delete` veya `Backspace` |
| Seçili parçayı çoğalt | `Ctrl` + `D` |
| Seçimi kaldır | `Esc` |

## Hamur ve veri karşılıkları

| Hamur | Veri bilimi kavramı |
|---|---|
| Renk / grup adı | Kategorik değişken (ör. kıta) |
| Büyüklük (hacim) | Gözlem sayısı *n* |
| Doku | Gürültü: noktaların yüzeyden saçılması |
| Bükülme | Doğrusal olmayan (eğrisel) ilişki |
| Ayrı parçalar | Alt gruplar ve kümeler |
| Düz levha | Düzlemsel yapı: ilk iki bileşen varyansın çoğunu açıklar |
| Hamur türü | Yalnızca görünüm, veriyi etkilemez |

## Colab ile kullanım

İndirilen `doughlab-data.csv` dosyası şu sütunları içerir:

| Sütun | Açıklama |
|---|---|
| `x`, `y`, `z` | Noktanın sahnedeki koordinatları |
| `group` | Parçaya verilen grup adı (kategorik değişken) |
| `piece` | Parçanın adı |
| `shape` | `ball`, `snake` veya `slab` |
| `dough` | `classic`, `glossy` veya `glitter` |

```python
import pandas as pd
import seaborn as sns
from sklearn.decomposition import PCA

df = pd.read_csv("doughlab-data.csv")

pca = PCA(n_components=3).fit(df[["x", "y", "z"]])
print(pca.explained_variance_ratio_)

sns.pairplot(df, vars=["x", "y", "z"], hue="group")
```

## Nasıl çalışır?

<details>
<summary><b>Nokta örnekleme</b></summary>

- Noktalar, parçanın bükülmemiş hali içinde **reddetme örneklemesiyle** (rejection sampling) düzgün dağılımlı olarak üretilir. Ardından aynı bükme dönüşümü uygulanır.
- Nokta sayısı: `yoğunluk × hacim × |ölçek|`. Parça başına en fazla 5.000 nokta.
- Doku, her eksene `σ = 0.3 × doku` standart sapmalı Gauss gürültüsü ekler.
- Her parçanın sabit bir rastgele tohumu (seed) vardır. Böylece ayarlar değiştikçe nokta bulutu titremez.

</details>

<details>
<summary><b>Canlı analiz</b></summary>

- **PCA**, `x, y, z` koordinatlarının kovaryans matrisi üzerinden hesaplanır (Jacobi özdeğer yöntemi). Tüm eksenler aynı birimde olduğu için standartlaştırma yapılmaz.
- **Şekil yorumu:**
  - PC1 ≥ %85 ise *çizgisel*,
  - PC1 + PC2 ≥ %90 ise *düzlemsel*,
  - aksi halde *hacimsel*.
- Sahnedeki PCA eksenleri ağırlık merkezinden **±2 standart sapma** uzunluğundadır.
- **Kendall τ-b** O(n²) karmaşıklıktadır. Bu yüzden 1.500 noktadan fazlası olduğunda sabit tohumlu bir alt örnekle hesaplanır.
- **η²** = gruplar arası kareler toplamı / toplam kareler toplamı.

</details>

<details>
<summary><b>Hayalet veri</b></summary>

- **CSV okuma:** Virgül, noktalı virgül ve sekme ayraçları otomatik algılanır. Noktalı virgüllü dosyalarda ondalık virgül desteklenir. En fazla 20.000 satır kullanılır.
- **Eksik değerler:** Seçilen sütunlardan birinde değer eksik olan satırlar çıkarılır.
- **Log dönüşümü (isteğe bağlı):** Tüm değerleri pozitif ve çarpıklığı 1'den büyük olan sütunlara `log10` uygulanır.
- **Ölçekleme:** Sütunlar merkezlenir; standartlaştırma açıksa z-skoruna çevrilir. Ardından PCA uygulanır.
- **Sahneye yerleştirme:** PC1 → x, PC2 → z (zemin), PC3 → y (yukarı). PC1 sahnede 10 birim genişliğe ölçeklenir.
- **Uyum skoru:** Hayaletin genişliğinin %5'i yarıçap olarak kullanılır.
  - *Kapsama:* Yakınında hamur noktası bulunan hayalet noktalarının oranı.
  - *Taşma:* Yakınında hiç hayalet noktası olmayan hamur noktalarının oranı.

**Doğrulama:** Gapminder verisinde (`year`, `pop`, `lifeExp`, `gdpPercap`, standartlaştırılmış) ilk üç bileşen varyansın **%46.3 + %25.5 + %19.0 = %90.9**'unu açıklar. Standartlaştırma kapatıldığında varyansın tamamı PC1'de toplanır, çünkü `pop` diğer değişkenleri bastırır. Bu, standartlaştırmanın önemini gösteren güzel bir örnektir.

</details>

## Proje yapısı

Derleme adımı yoktur. Tüm kod tarayıcıda doğrudan çalışan ES modüllerinden oluşur.

```
index.html          Arayüz iskeleti
style.css           Stiller
src/
  main.js           Sahne, parçalar, arayüz, dışa aktarma
  geometry.js       Hamur geometrileri, bükme, yüzey dokusu
  sampling.js       Parça içinden nokta örnekleme
  analysis.js       PCA, Pearson, Spearman, Kendall, η²
  ghost-data.js     CSV okuma, hayalet PCA'sı, uyum skoru (Three.js'siz)
  ghost.js          Hayalet nokta bulutu ve değişken okları
  arrows.js         Etiketli 3B oklar
docs/               README görselleri
```

## Yol haritası

- [x] Canlı PCA, korelasyon ve η² paneli
- [x] CSV'den hayalet nokta bulutu ve hamur uyum skoru
- [ ] **Gölge modu:** ışığı döndürüp 2B projeksiyonu gerçek PCA projeksiyonuyla karşılaştırma
- [ ] Regresyon düzlemi ve residual grafiği
- [ ] İngilizce arayüz seçeneği
- [ ] Dokunmatik ekran iyileştirmeleri

## Katkı

Katkılar memnuniyetle karşılanır.

- Hata bildirmek ya da öneride bulunmak için bir [issue](https://github.com/hbt00002/doughlab/issues) aç.
- Kod değişikliği için depoyu *fork*'la, ayrı bir dalda çalış ve bir *pull request* gönder.
- Mevcut kod stiline uy. Proje bilinçli olarak derleme adımı ve bağımlılık yöneticisi olmadan tutuluyor.

## Lisans ve teşekkür

[MIT](LICENSE) lisansı ile yayınlanmıştır.

- 3B görselleştirme: [Three.js](https://threejs.org)
- Gapminder örnek verisi çalışma anında [plotly/datasets](https://github.com/plotly/datasets) deposundan indirilir. Veri [Gapminder](https://www.gapminder.org) kaynaklıdır.
