<template>
  <div>
    <!-- В этом макете мы просто вызываем хедер, НЕ передавая ничего в слот -->
    <CommonSiteHeader />
    <main>
      <slot />
    </main>
  </div>
</template>
